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
  for (const roof of ['single', 'gable'] as const)
    for (const highSide of ['front', 'back', 'left', 'right'] as const)
      for (const cover of ['prof', 'poly', 'none'] as const)
        for (const base of ['slab', 'piles', 'none'] as const) {
          const r = buildCanopy({ L: 6, W: 4, roof, highSide, cover, base, hHigh: 3.2, hLow: 2.6, walls: { front: 'open', back: 'prof_full', left: 'mesh', right: 'prof' } });
          assert.ok(r.members.length > 10);
          for (const m of r.members) for (const c of [...m.a, ...m.b]) assert.ok(Number.isFinite(c));
          for (const l of r.lines) assert.ok(l.qty > 0 && Number.isFinite(l.price), `${roof}/${highSide}/${cover}/${base}: ${l.name}`);
        }
});
