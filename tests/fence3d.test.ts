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
