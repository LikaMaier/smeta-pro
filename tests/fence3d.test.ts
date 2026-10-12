import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFence } from '../shared/design/fence3d';
import { buildSite, siteChecks, SITE_PRESETS } from '../shared/design/site';
import { buildDesign } from '../shared/design/build';
import { drawings, render3d } from '../shared/design/render';
import { designPdfData } from '../shared/design/report';
import { FENCE_3D_TYPES } from '../shared/design/fence3d';

test('забор по умолчанию: периметр, ворота, калитка, смета', () => {
  const r = buildFence({});
  assert.equal(r.info.perimeter, 100);
  assert.equal(r.openings.length, 2);
  assert.ok(r.lines.some((l) => /откатных ворот/.test(l.name)));
  assert.ok(r.lines.some((l) => /калитк/i.test(l.name)));
  assert.ok(r.steel.length > 0 && r.info.steelKg > 300);
  assert.equal(r.tail, 2); // противовес — половина проёма 4 м
  assert.deepEqual(r.warnings, []);
});

test('все виды забора строятся, рисуются и дают PDF-данные', () => {
  for (const type of FENCE_3D_TYPES) {
    for (const gate of ['slide', 'swing', 'none'] as const) {
      const r = buildFence({ type, gate, L: 15, W: 12 });
      assert.ok(r.panels.length > 0, type);
      assert.ok(r.lines.length > 3, type);
      const sh = drawings(r);
      assert.ok(sh.length >= 2, type);
      assert.ok(render3d(r).items.length > 10, type);
      const d = designPdfData(r, { title: 't' });
      assert.equal(d.layout, 'sheets');
      assert.ok(d.params.length > 5);
    }
  }
});

test('откатным воротам не хватает места — предупреждение', () => {
  const r = buildFence({ L: 10, gateAt: 4, gateW: 4, slideDir: 'right', wicket: false });
  assert.ok(r.warnings.some((w) => /свободного забора/.test(w)));
  const ok = buildFence({ L: 20, gateAt: 8, gateW: 4, slideDir: 'left', wicket: false });
  assert.ok(!ok.warnings.some((w) => /свободного забора/.test(w)));
});

test('калитка в зоне отката — предупреждение', () => {
  const r = buildFence({ L: 20, gateAt: 2, gateW: 4, slideDir: 'right', wicket: true, wicketAt: 8 });
  assert.ok(r.warnings.some((w) => /Калитка в зоне отката/.test(w)));
});

test('типовые участки — без нарушений норм', () => {
  for (const pr of SITE_PRESETS) {
    const bad = siteChecks(pr.p).filter((c) => !c.ok && !c.soft);
    assert.deepEqual(bad.map((c) => c.label), [], pr.id);
  }
});

test('нормы: септик у дома и газгольдер у скважины', () => {
  const p = JSON.parse(JSON.stringify(SITE_PRESETS[0].p));
  const sep = p.objs.find((o: any) => o.type === 'septic');
  const house = p.objs.find((o: any) => o.type === 'house');
  sep.x = house.x; sep.y = house.y - house.d / 2 - 2; // 2 м от стены
  const c = siteChecks(p).find((x) => x.label === 'Септик — дом')!;
  assert.equal(c.ok, false);
  assert.ok(Math.abs(c.d - 1.1) < 0.01); // 2 м до центра минус полразмера септика
});

test('участок: смета по инженерке и мощению, 3D и чертежи', () => {
  const r = buildSite(SITE_PRESETS[1].p);
  for (const name of ['Монтаж станции биоочистки (Топас и аналоги)', 'Монтаж газгольдера под ключ', 'Бурение скважины на известняк', 'Укладка тротуарной плитки (с основанием)', 'Посев газона'])
    assert.ok(r.lines.some((l) => l.name === name), name);
  assert.equal(drawings(r).length, 2);
  assert.ok(render3d(r, -35, 40).items.length > 50);
  assert.equal(buildDesign({ kind: 'site', ...SITE_PRESETS[0].p }).site, true);
  assert.equal((buildDesign({ kind: 'fence' }) as any).fence, true);
});

import { buildMep, autoPlace, MEP_PRESETS } from '../shared/design/mep';
test('электрика и сантехника: все планировки — точки, группы, трубы, чертежи', () => {
  for (const pr of MEP_PRESETS) {
    const base: any = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: pr.object };
    base.points = autoPlace(base);
    const r = buildMep(base);
    assert.ok(r.groups.length >= 2, pr.id);
    assert.ok(r.lines.length > 10, pr.id);
    assert.ok(r.pipeLen.cold > 0, pr.id);
    assert.ok(drawings(r).length >= 2, pr.id);
    assert.ok(designPdfData(r, { title: 't' }).params.length > 4);
    // все работы — из справочника (Builder иначе бросил бы ошибку), кабель и автоматы посчитаны
    assert.ok(r.lines.some((l) => /ВВГнг/.test(l.name)));
  }
});
test('плита — отдельная группа 32 А кабелем 3×6, мокрые зоны — через дифавтомат', () => {
  const pr = MEP_PRESETS.find((x) => x.id === 'flat1')!;
  const base: any = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: 'flat' };
  base.points = autoPlace(base);
  const r = buildMep(base);
  const stove = r.groups.find((g) => /плита/i.test(g.name))!;
  assert.equal(stove.amp, 32); assert.equal(stove.cable, '3×6');
  assert.ok(r.groups.filter((g) => /Ванн|Санузел/.test(g.name)).every((g) => g.rcd));
  assert.ok(r.pipeLen.s110 > 0); // от унитаза — Ø110
});

import { lineFor, inputFor, bathZone, panelLayout } from '../shared/design/mepNorms';
import { elDefaults } from '../shared/design/mep';
test('нормы электрики: автомат и сечение, потери, ввод, зоны ванной', () => {
  assert.deepEqual([lineFor({ watt: 7000, lmax: 10, minS: 6 }).amp, lineFor({ watt: 7000, lmax: 10, minS: 6 }).s], [32, 6]);
  assert.equal(lineFor({ watt: 1000, lmax: 10, fixedAmp: 10 }).s, 1.5);
  const far = lineFor({ watt: 3500, lmax: 60, fixedAmp: 16 }); // 16 А на 60 м — потери > 4%, сечение растёт
  assert.ok(far.upsized && far.s >= 4 && far.du <= 4);
  assert.equal(inputFor(15, 3).amp, 25);
  assert.equal(inputFor(7, 1).amp, 32);
  assert.equal(bathZone(0.5, 0.5, 1, [{ x0: 0, y0: 0, x1: 1, y1: 1 }]), 1);
  assert.equal(bathZone(1.3, 0.5, 1, [{ x0: 0, y0: 0, x1: 1, y1: 1 }]), 2);
  assert.equal(bathZone(1.7, 0.5, 1, [{ x0: 0, y0: 0, x1: 1, y1: 1 }]), 3);
  assert.equal(bathZone(0.5, 0.5, 2.4, [{ x0: 0, y0: 0, x1: 1, y1: 1 }]), 3);
  const sh = panelLayout({ phases: 1, inAmp: 50, spd: true, house: false, protect: 'diff', groups: [{ amp: 16, rcd: true, name: 'a' }, { amp: 10, rcd: false, name: 'b' }] });
  assert.ok(sh.size >= sh.used * 1.2);
});
test('расстановка по нормам: без нарушений, розеток по норме, мокрые зоны через УЗО', () => {
  for (const pr of MEP_PRESETS) for (const gas of [false, true]) {
    const base: any = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: pr.object, ...elDefaults(pr.object, gas) };
    base.points = autoPlace(base);
    const r = buildMep(base);
    const bad = r.checks.filter((c) => c.lvl === 'err' || c.lvl === 'warn');
    assert.deepEqual(bad.map((c) => c.text), [], `${pr.id} gas=${gas}`);
    assert.ok(r.groups.filter((g) => g.kind === 'wireS').every((g) => g.rcd && g.amp === 16 && g.s >= 2.5));
    assert.ok(r.groups.every((g) => !g.amp || g.du <= 4));
    if (gas) assert.ok(!r.groups.some((g) => /плита/i.test(g.name)));
    assert.ok(drawings(r).length >= 3, pr.id);
  }
});
test('проверка ловит розетку у ванны и у газа', () => {
  const pr = MEP_PRESETS.find((x) => x.id === 'bathroom')!;
  const base: any = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: 'flat' };
  base.points = autoPlace(base);
  const bath = base.points.find((x: any) => x.type === 'bath' || x.type === 'shower');
  base.points.push({ id: 'bad1', type: 'socketWet', x: bath.x, y: bath.y + 0.1, z: 1 }, { id: 'g', type: 'gasPipe', x: 2, y: 2 }, { id: 'bad2', type: 'socket', x: 2.2, y: 2 });
  const r = buildMep(base);
  assert.ok(r.checks.some((c) => c.lvl === 'err' && c.ids?.includes('bad1')));
  assert.ok(r.checks.some((c) => c.lvl === 'err' && c.ids?.includes('bad2')));
});
