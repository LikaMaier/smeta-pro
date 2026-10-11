import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCanopy } from '../shared/design/canopy';
import { cutStock, tubeKgPerM } from '../shared/design/cut';

test('раскрой: 7 кусков по 5,1 м из 12-метровых хлыстов → 4 хлыста', () => {
  const r = cutStock([5.1, 5.1, 5.1, 5.1, 5.1, 5.1, 5.1], 12);
  assert.equal(r.bars, 4);
  assert.ok(r.wastePct > 20 && r.wastePct < 30);
  assert.equal(cutStock([13], 12).bars, 2); // длиннее хлыста — стык
});

test('масса трубы 100×100×4 ≈ 12 кг/м', () => {
  assert.ok(Math.abs(tubeKgPerM(100, 100, 4) - 12.06) < 0.05);
});

test('навес площадки ТКО 10,2×9,2, высота 6/5: плита, бетон, выемка — без противоречий картинки', () => {
  const r = buildCanopy({});
  assert.equal(r.info.slabArea, 93.8);
  const line = (s: string) => r.lines.find((l) => l.name.startsWith(s))!;
  assert.equal(line('Бетон М300').qty, 14.5); // 93,84 × 0,15 × 1,03
  assert.equal(line('Бетонирование плиты').qty, 14.08);
  assert.ok(line('Разработка грунта').qty > 51); // с запасом 0,3 м по периметру
  assert.ok(r.info.truss, 'пролёт 10,2 м — фермы');
  assert.ok(r.info.posts >= 12);
  // въезд мусоровоза спереди: столбы только по углам, над проёмом ферма
  assert.ok(r.members.filter((m) => m.kind === 'post' && m.a[1] === 0).every((m) => m.a[0] === 0 || m.a[0] === 10.2));
  assert.ok(r.girder && r.girder.len === 10.2);
  assert.equal(r.panels.filter((p) => p.kind === 'container').length, 6);
  for (const l of r.lines) assert.ok(Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.price), l.name);
});

test('все варианты: односкатная/двускатная, уклон в 4 стороны, кровля, стены, основание', () => {
  for (const roof of ['single', 'gable', 'hip'] as const)
    for (const highSide of ['front', 'back', 'left', 'right'] as const)
      for (const cover of ['prof', 'tile', 'poly', 'none'] as const)
        for (const base of ['slab', 'piles', 'deck', 'none'] as const) {
          const r = buildCanopy({ L: 6, W: 4, roof, highSide, cover, base, hHigh: 3.2, hLow: 2.6, attach: highSide === 'back', gate: base === 'slab' ? 'swing' : 'none', door: cover === 'tile', insulate: base === 'none', walls: { front: 'prof_full', back: 'prof_full', left: 'mesh', right: roof === 'hip' ? 'rail' : 'prof' } });
          for (const pn of r.panels) for (const q of pn.pts) for (const c of q) assert.ok(Number.isFinite(c));
          assert.ok(r.members.length > 10);
          for (const m of r.members) for (const c of [...m.a, ...m.b]) assert.ok(Number.isFinite(c));
          for (const l of r.lines) assert.ok(l.qty > 0 && Number.isFinite(l.price), `${roof}/${highSide}/${cover}/${base}: ${l.name}`);
        }
});

test('пристенный навес: со стороны дома нет столбов, есть анкеры и крепление к стене', () => {
  const r = buildCanopy({ kind: 'lean', L: 6, W: 4, roof: 'single', highSide: 'back', attach: true, hHigh: 3, hLow: 2.5, walls: { front: 'open', back: 'prof_full', left: 'open', right: 'open' }, base: 'piles', cover: 'poly' });
  assert.equal(r.params.walls.back, 'open'); // стена дома вместо обшивки
  assert.ok(r.members.filter((m) => m.kind === 'post').every((m) => m.a[1] < 3.99));
  assert.ok(r.panels.some((p) => p.kind === 'house'));
  assert.equal(r.lines.find((l) => l.name === 'Крепление навеса к стене дома анкерами')!.qty, 6);
  assert.ok(r.lines.some((l) => l.name.startsWith('Анкерные болты')));
});

test('беседка 4×3: четырёхскатная кровля, перила, настил на винтовых сваях', () => {
  const r = buildCanopy({ kind: 'gazebo', L: 4, W: 3, roof: 'hip', hHigh: 3.4, hLow: 2.3, overhang: 0.5, cover: 'tile', postStep: 2, walls: { front: 'open', back: 'rail', left: 'rail', right: 'rail' }, base: 'deck' });
  assert.equal(r.panels.filter((p) => p.kind === 'roof').length, 4);
  assert.ok(r.info.roofArea > 5 * 4 && r.info.roofArea < 5 * 4 * 1.5, `кровля ${r.info.roofArea}`); // (4+1)×(3+1)=20 м² в плане
  assert.ok(r.members.some((m) => m.kind === 'hip'));
  assert.ok(r.members.filter((m) => m.kind === 'baluster').length > 50);
  assert.equal(r.lines.find((l) => l.name === 'Изготовление перил')!.qty, 10);
  assert.equal(r.lines.find((l) => l.name === 'Монтаж террасной доски')!.qty, 12);
  assert.ok(r.lines.find((l) => l.name === 'Монтаж винтовых свай')!.qty === 9);
  assert.ok(r.lines.some((l) => l.name === 'Монтаж металлочерепицы'));
});

test('гараж 6×6: секционные ворота 3×2,5 и дверь на фасаде, столбов в проёме нет, фронтон обшит', () => {
  const r = buildCanopy({ kind: 'garage', L: 6, W: 6, roof: 'gable', highSide: 'left', hHigh: 3.6, hLow: 2.8, cover: 'prof', walls: { front: 'prof_full', back: 'prof_full', left: 'prof_full', right: 'prof_full' }, gate: 'sectional', gateW: 3, gateH: 2.5, door: true, insulate: true, base: 'slab', slabOver: 0 });
  const gate = r.openings.find((o) => o.kind === 'gate')!;
  assert.deepEqual([gate.a0, gate.a1], [1.5, 4.5]);
  const door = r.openings.find((o) => o.kind === 'door')!;
  assert.equal(door.side, 'front');
  assert.ok(door.a1 <= gate.a0 - 0.3 || door.a0 >= gate.a1 + 0.3);
  for (const m of r.members.filter((m) => m.kind === 'post' && m.a[1] === 0)) assert.ok(m.a[0] < 1.4 || m.a[0] > 4.6, `столб в проёме ворот: ${m.a[0]}`);
  // фронтон: обшивка доходит до конька
  const front = r.panels.filter((p) => p.kind === 'prof' && p.pts.every((q) => q[1] === 0));
  assert.ok(Math.max(...front.flatMap((p) => p.pts.map((q) => q[2]))) > 3.5);
  assert.ok(r.lines.some((l) => l.name.startsWith('Ворота секционные 3 × 2.5')));
  assert.ok(r.lines.some((l) => l.name === 'Монтаж входной металлической двери'));
  assert.ok(r.lines.some((l) => l.name === 'Утепление кровли'));
});

import { PRESETS } from '../shared/design/presets';
import { drawings, render3d } from '../shared/design/render';
import { designPdfData } from '../shared/design/report';

test('все типовые проекты строятся: 3D, чертежи, смета без пустых строк', () => {
  for (const pr of PRESETS) {
    const r = buildCanopy(pr.p);
    assert.ok(r.members.length > 5, pr.id);
    for (const m of r.members) for (const c of [...m.a, ...m.b]) assert.ok(Number.isFinite(c), `${pr.id}: ${m.kind}`);
    for (const l of r.lines) assert.ok(l.qty > 0 && Number.isFinite(l.price) && l.price >= 0, `${pr.id}: ${l.name}`);
    assert.ok(r.lines.length > 5, pr.id);
    assert.ok(render3d(r).items.length > 20, pr.id);
    assert.ok(drawings(r).length >= 5, pr.id);
    const d = designPdfData(r, { title: pr.title });
    assert.ok(d.total > 10000, `${pr.id}: ${d.total}`);
    if (pr.p.door) assert.ok(r.openings.some((o) => o.kind === 'door'), `${pr.id}: дверь не поставилась`);
  }
});

test('арочная теплица 3×6: дуга по высоте 1,5→2,5, гибка трубы, поликарбонат на стенах', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'gh-36')!.p);
  assert.ok(Math.abs(r.topAt(1.5, 3) - 2.5) < 0.01 && Math.abs(r.topAt(0, 3) - 1.5) < 0.01);
  assert.ok(r.lines.some((l) => l.name === 'Гибка профильной трубы'));
  assert.ok(r.lines.some((l) => l.name === 'Обшивка каркаса поликарбонатом'));
  assert.ok(r.panels.filter((p) => p.kind === 'roof').length >= 16);
  const door = r.openings.find((o) => o.kind === 'door')!;
  assert.equal(door.side, 'front');
});

test('деревянный каркас: брус и доска в м³, сборка каркаса, без металла', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'gazebo-wood')!.p);
  assert.ok(r.info.wood && r.info.woodVol > 0.3);
  assert.ok(r.lines.some((l) => l.name.startsWith('Брус 150×150')));
  assert.ok(r.lines.some((l) => l.name === 'Сборка деревянного каркаса'));
  assert.ok(!r.lines.some((l) => l.name.startsWith('Труба профильная')));
  assert.ok(!r.lines.some((l) => l.name === 'Изготовление металлоконструкций'));
});

test('козырёк: без столбов, на консолях, с анкерами', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'visor')!.p);
  assert.equal(r.members.filter((m) => m.kind === 'post').length, 0);
  assert.ok(r.members.filter((m) => m.kind === 'brace').length >= 2);
  assert.ok(r.lines.some((l) => l.name.startsWith('Анкерные болты')));
});

test('доп. опции: водосток, снегозадержатели, освещение, плитка', () => {
  const r = buildCanopy({ kind: 'canopy', L: 6, W: 6, roof: 'gable', highSide: 'front', hHigh: 3.5, hLow: 2.6, cover: 'prof', walls: { front: 'open', back: 'open', left: 'open', right: 'open' }, base: 'paving', gutter: true, snowGuard: true, lights: 3 });
  const has = (n: string) => r.lines.some((l) => l.name === n);
  assert.ok(has('Монтаж водосточной системы') && has('Монтаж снегозадержателей') && has('Монтаж светильника') && has('Укладка тротуарной плитки (с основанием)'));
  assert.equal(r.lines.find((l) => l.name === 'Монтаж светильника')!.qty, 3);
});

import { snowByCity } from '../shared/design/snow';
import { mergeAiParams } from '../shared/design/ai';
import { CANOPY_DEFAULT } from '../shared/design/canopy';

test('снеговой район по городу', () => {
  assert.equal(snowByCity('Москва')!.region, 3);
  assert.equal(snowByCity('г. Всеволожск')!.region, 3);
  assert.equal(snowByCity('тихвин')!.region, 4);
  assert.equal(snowByCity('Пермь')!.region, 5);
  assert.equal(snowByCity('Петропавловск-Камчатский')!.region, 7);
  assert.equal(snowByCity('Королев')!.name, 'Королёв');
  assert.equal(snowByCity('Нигдеград'), null);
  const p = mergeAiParams(CANOPY_DEFAULT, { city: 'Уфа', snow: null, L: 5 });
  assert.equal(p.snow, 5); assert.equal(p.L, 5);
});

test('фундаменты: УШП, лента, винтовые сваи — свои работы, материалы и разрез', () => {
  const base = { kind: 'garage' as const, L: 6, W: 6, roof: 'gable' as const, highSide: 'left' as const, hHigh: 3.5, hLow: 2.7, walls: { front: 'prof_full', back: 'prof_full', left: 'prof_full', right: 'prof_full' } as any };
  const u = buildCanopy({ ...base, base: 'ushp', slabT: 0.1, eps: 0.1, sand: 0.3 });
  assert.ok(u.lines.some((l) => l.name === 'Утепление фундамента ЭППС'));
  assert.ok(drawings(u).some((s) => s.title.startsWith('Разрез УШП')));
  const st = buildCanopy({ ...base, base: 'strip', stripW: 0.4, stripD: 0.7 });
  const lf = st.lines.find((l) => l.name === 'Ленточный фундамент под ключ (без материала)')!;
  assert.equal(lf.qty, 6.72); // 24 м × 0,4 × 0,7
  assert.ok(st.panels.filter((p) => p.kind === 'strip').length === 4);
  assert.ok(drawings(st).some((s) => s.title.startsWith('Разрез ленточного фундамента')));
  const sc = buildCanopy({ ...base, base: 'screw' });
  assert.equal(sc.lines.find((l) => l.name === 'Монтаж винтовых свай')!.qty, sc.info.posts);
  // V снеговой район — стропила мощнее
  const s3 = buildCanopy({ ...base, walls: undefined, snow: 3 }), s5 = buildCanopy({ ...base, walls: undefined, snow: 5 });
  assert.ok(s5.info.steelKg > s3.info.steelKg);
});

import { makeVariants } from '../shared/design/variants';

test('консольный Т-навес: столбы только по центру, подкосы в обе стороны, стены открыты', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'park-t')!.p);
  const posts = r.members.filter((m) => m.kind === 'post');
  assert.ok(posts.length >= 3 && posts.every((m) => Math.abs(m.a[0] - 3.5) < 1e-6));
  assert.equal(r.members.filter((m) => m.kind === 'brace').length, posts.length * 2);
});

test('многопролётный: промежуточный ряд столбов делит пролёт, без ферм', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'park-10')!.p);
  assert.ok(r.members.some((m) => m.kind === 'post' && Math.abs(m.a[1] - 5.5) < 1e-6));
  assert.equal(r.info.truss, false);
  const one = buildCanopy({ ...PRESETS.find((p) => p.id === 'park-10')!.p, midRows: 0 });
  assert.ok(one.info.posts < r.info.posts);
});

test('пергола: ламели вместо кровли, без кровельных материалов и водостока', () => {
  const r = buildCanopy({ ...PRESETS.find((p) => p.id === 'pergola-m')!.p, gutter: true });
  assert.equal(r.panels.filter((p) => p.kind === 'roof').length, 0);
  assert.ok(!r.lines.some((l) => /Профнастил кровельный|Монтаж водосточной/.test(l.name)));
  assert.ok(r.steel.some((s) => s.use.includes('ламели')));
});

test('три варианта: эконом дешевле стандарта, премиум дороже', () => {
  for (const id of ['car2', 'gazebo', 'garage', 'terrace-m']) {
    const vs = makeVariants(buildCanopy(PRESETS.find((p) => p.id === id)!.p).params);
    const t = vs.map((v) => buildCanopy(v.params).lines.reduce((a, l) => a + l.qty * l.price, 0));
    assert.ok(t[0] <= t[1] && t[1] < t[2], `${id}: ${t.map(Math.round)}`);
  }
});

test('совмещённый объект: блок с перегородкой, ворота в блоке, въезд без столбов только в открытой части', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'combo-garage')!.p);
  const gate = r.openings.find((o) => o.kind === 'gate')!;
  assert.ok(gate.a0 >= 0 && gate.a1 <= 4.5);
  assert.ok(r.members.some((m) => m.kind === 'post' && Math.abs(m.a[0] - 4.5) < 1e-6 && m.a[1] > 0 && m.a[1] < 6)); // столбы перегородки
  const shed = buildCanopy(PRESETS.find((p) => p.id === 'combo-car-shed')!.p);
  assert.ok(shed.members.some((m) => m.kind === 'post' && m.a[1] === 0 && Math.abs(m.a[0] - 3) < 1e-6), 'столб на границе блока остаётся');
  assert.ok(shed.panels.some((p) => p.kind === 'prof' && p.pts.every((q) => Math.abs(q[0] - 3) < 1e-6)), 'перегородка обшита');
});

test('связи жёсткости, бордюр, колесоотбойники; ТКО СНТ — бункеры и отсек КГМ', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'snt-kgm')!.p);
  assert.ok(r.members.filter((m) => m.kind === 'tie').length >= 4);
  assert.ok(r.lines.some((l) => l.name.startsWith('Бордюр дорожный')));
  assert.ok(r.lines.some((l) => l.name.startsWith('Колесоотбойник')));
  assert.ok(r.lines.some((l) => l.name.startsWith('Отбойник для контейнеров')));
  // контейнеры не заходят в отсек КГМ (правые 4 м)
  for (const c of r.panels.filter((p) => p.kind === 'container')) assert.ok(c.pts.every((q) => q[0] <= 11 + 1e-6));
  const b = buildCanopy(PRESETS.find((p) => p.id === 'snt-bunker')!.p);
  assert.equal(b.panels.filter((p) => p.kind === 'container').length, 2);
  const big = buildCanopy(PRESETS.find((p) => p.id === 'snt-big')!.p);
  assert.ok(big.girder && big.girder.len === 9);
});

test('свои цены: металл и С-8 по цене прораба', () => {
  const p = PRESETS.find((x) => x.id === 'car2')!.p;
  const a = buildCanopy(p), b = buildCanopy(p, { steelKg: 190, profC8: 960 });
  const tube = (r: any) => r.lines.filter((l: any) => l.name.startsWith('Труба профильная')).reduce((s: number, l: any) => s + l.qty * l.price, 0);
  assert.ok(Math.abs(tube(b) / tube(a) - 2) < 0.02);
  assert.ok(b.lines.some((l) => l.name.startsWith('Профнастил С-8') && l.unit === 'лист'));
});

test('узлы на чертежах: опора, столб — обвязка, стропило, связь', () => {
  const r = buildCanopy(PRESETS.find((p) => p.id === 'snt-8')!.p);
  const t = drawings(r).map((s) => s.title);
  assert.ok(t.some((x) => x.startsWith('Узел 1')) && t.some((x) => x.startsWith('Узел 2')) && t.some((x) => x.startsWith('Узел 3')) && t.some((x) => x.startsWith('Узел 4')));
});
