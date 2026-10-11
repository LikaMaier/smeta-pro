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
  assert.ok(r.info.posts >= 14);
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
