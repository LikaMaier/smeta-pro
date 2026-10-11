import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTERS } from '../shared/masters';
import { getCalculator, runCalc } from '../shared/calculators';

/** Перебор всех вариантов каждого select-поля (по одному за раз) с значениями по умолчанию */
function variants(m: (typeof MASTERS)[number]) {
  const base: Record<string, any> = {};
  m.fields.forEach((f) => (base[f.key] = f.default));
  const out = [base];
  for (const f of m.fields) if (f.type === 'select') for (const o of f.options!) out.push({ ...base, [f.key]: o.value });
  // всё «включено»
  const all = { ...base };
  m.fields.forEach((f) => { if (f.type === 'select' && f.options!.some((o) => o.value === 'yes')) all[f.key] = 'yes'; else if (f.type !== 'select' && !f.integer) all[f.key] = Number(f.default) || 3; else if (f.integer) all[f.key] = Math.max(1, Number(f.default) || 1); });
  out.push(all);
  return out;
}

test('каждый мастер × все варианты: строки корректны, работы из справочника', () => {
  assert.ok(MASTERS.length >= 14);
  for (const m of MASTERS) {
    for (const v of variants(m)) {
      const b = m.build(v);
      assert.ok(b.lines.length >= 3, `${m.id}: мало строк для ${JSON.stringify(v)}`);
      for (const l of b.lines) {
        assert.ok(Number.isFinite(l.qty) && l.qty > 0, `${m.id}: ${l.name} qty=${l.qty} при ${JSON.stringify(v)}`);
        assert.ok(Number.isFinite(l.price) && l.price >= 0, `${m.id}: ${l.name} price`);
      }
    }
  }
});

test('мастера доступны как калькуляторы и считают итог', () => {
  for (const m of MASTERS) {
    const c = getCalculator(m.id)!;
    assert.ok(c, m.id);
    const d: Record<string, any> = {};
    c.fields.forEach((f) => (d[f.key] = f.default));
    const r = runCalc(c, d);
    assert.ok(r.output, `${m.id}: ${JSON.stringify(r.errors)}`);
    assert.ok(r.output!.rows[0].value > 0, `${m.id}: итог 0`);
    assert.ok(r.output!.suggestions.length > 0);
  }
});

test('плиточник: санузел 4 м² пол + 22 м² стен, 30×60 прямо', () => {
  const b = MASTERS.find((m) => m.id === 'm-tile')!.build({ obj: 'bath', floor: 4, walls: 22, apron: 0, steps: 0, fmt: 'mid', lay: 'straight', prep: 'primer', hydro: 'yes', grout: 'cement', cut45: 0, corners: 0, hatch: 0, drain: 'no', demo: 'no', cx: '1', debris: 'no' });
  const get = (n: string) => b.lines.find((l) => l.name.startsWith(n))!;
  assert.equal(get('Укладка плитки на пол').qty, 4);
  assert.equal(get('Укладка плитки на стены').qty, 22);
  assert.equal(get('Плитка / керамогранит').qty, 28.6); // 26 × 1,1
});

test('кровля: двускатная 10×8, свесы 0,5, 30° → площадь ≈ 117 м²', () => {
  const b = MASTERS.find((m) => m.id === 'm-roof')!.build({ shape: 'gable', L: 10, W: 8, o: 0.5, angle: 30, cover: 'metal', rafters: 'new', ins: 'no', gutter: 'yes', snow: 'yes', soffit: 'no', windows: 0, chimney: 0, wallH: 3, demo: 'no', cx: '1', debris: 'no' });
  assert.equal(b.summary[0].value, 114.3); // 11 × 9 / cos30
});
