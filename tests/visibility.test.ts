import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTERS } from '../shared/masters';
import { CALCULATORS, getCalculator, runCalc, visibleFields, normalizeValues, fieldNumber } from '../shared/calculators';

let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const sig = (m: any, v: any) => { const b = m.build(v); return JSON.stringify([b.lines.map((l: any) => [l.name, l.qty, l.unit, l.price, l.category, l.note]), b.warnings]); };
const defaults = (fields: any[]) => Object.fromEntries(fields.map((f) => [f.key, f.default ?? '']));

test('скрытое поле мастера не влияет на расчёт (или по умолчанию равно 0)', () => {
  let hiddenRules = 0;
  for (const m of MASTERS) {
    const calc = getCalculator(m.id)!;
    for (const F of m.fields.filter((f) => f.showIf)) {
      hiddenRules++;
      if (F.type !== 'select' && Number(F.default) === 0) continue; // скрыто → 0 → строк нет
      for (let n = 0; n < 250; n++) {
        const v: any = {};
        // среди значений обязательно есть 0: «0 — посчитать по площади» включает другие поля в расчёт
        m.fields.forEach((f) => (v[f.key] = f.type === 'select' ? pick(f.options!.map((o) => o.value)) : pick([Number(f.default) || 1, 0, 0, 1, 3, 7])));
        if (visibleFields(calc, v).includes(F)) continue;
        const variants = F.type === 'select' ? F.options!.map((o) => o.value) : [0, 1, Number(F.default) || 2, 9];
        const base = sig(m, { ...v, [F.key]: variants[0] });
        for (const fv of variants) assert.equal(sig(m, { ...v, [F.key]: fv }), base, `${m.id}: поле «${F.label}» скрыто, но меняет расчёт при ${JSON.stringify(v)}`);
      }
    }
  }
  assert.ok(hiddenRules > 50, 'правила видимости подключены');
});

test('условия видимости не зависят от скрываемых полей и не прячут управляющие списки', () => {
  for (const m of MASTERS) {
    const first = m.fields.find((f) => f.type === 'select');
    if (first && ['obj', 'kind', 'type', 'stage', 'shape', 'gate', 'glaze', 'src', 'sys', 'mat'].includes(first.key)) assert.ok(!first.showIf, `${m.id}: главный выбор всегда виден`);
    // при значениях по умолчанию расчёт через runCalc тот же, что напрямую
    const calc = getCalculator(m.id)!;
    const d = defaults(m.fields);
    const direct = m.build(normalizeValues({ ...calc, fields: m.fields.map((f) => ({ ...f, showIf: undefined })) } as any, d)).lines.length;
    assert.equal(runCalc(calc, d).output!.suggestions.length > 0, direct > 0, m.id);
  }
});

test('полы: при готовом основании и ламинате лишних полей нет', () => {
  const calc = getCalculator('m-floor')!;
  const keys = (v: any) => visibleFields(calc, { ...defaults(calc.fields), ...v }).map((f) => f.key);
  const lam = keys({ base: 'none', cover: 'laminate' });
  for (const k of ['thick', 'selfT', 'mesh', 'wfin']) assert.ok(!lam.includes(k), k);
  assert.ok(lam.includes('plinth') && lam.includes('area'));
  assert.ok(keys({ base: 'semi' }).includes('thick'));
  assert.ok(keys({ base: 'self' }).includes('selfT') && !keys({ base: 'self' }).includes('thick'));
  assert.ok(keys({ cover: 'massive' }).includes('wfin'));
  // скрытое поле со старым значением не меняет итог
  const a = runCalc(calc, { ...defaults(calc.fields), base: 'none', thick: 50 }).output!.rows[0].value;
  const b = runCalc(calc, { ...defaults(calc.fields), base: 'none', thick: 120 }).output!.rows[0].value;
  assert.equal(a, b);
});

test('плитка: фартук виден только для фартука, старое значение не попадает в санузел', () => {
  const calc = getCalculator('m-tile')!;
  const d = defaults(calc.fields);
  const bath = runCalc(calc, { ...d, obj: 'bath' }).output!.rows[0].value;
  const stale = runCalc(calc, { ...d, obj: 'bath', apron: 6, steps: 10 }).output!.rows[0].value;
  assert.equal(bath, stale);
  // фартук считается по своей площади, а не по «площади стен»
  const a3 = runCalc(calc, { ...d, obj: 'apron', apron: 3, walls: 22 }).output!.rows[0].value;
  const a3w = runCalc(calc, { ...d, obj: 'apron', apron: 3, walls: 90 }).output!.rows[0].value;
  assert.equal(a3, a3w);
  assert.ok(a3 > 0 && a3 < bath);
  const keys = visibleFields(calc, { ...d, obj: 'apron' }).map((f) => f.key);
  assert.ok(keys.includes('apron') && !keys.includes('walls') && !keys.includes('floor') && !keys.includes('hydro'));
});

test('в полях мастера можно писать размеры выражением: 3,2*4,1', () => {
  assert.equal(fieldNumber('3,2*4,1'), 13.12);
  assert.equal(fieldNumber('12,5'), 12.5);
  assert.equal(fieldNumber(' 1 250 '), 1250);
  assert.ok(Number.isNaN(fieldNumber('абв')));
  const calc = getCalculator('m-floor')!;
  const d = defaults(calc.fields);
  const a = runCalc(calc, { ...d, area: '4*5' }).output!.rows[0].value;
  const b = runCalc(calc, { ...d, area: 20 }).output!.rows[0].value;
  assert.equal(a, b);
  assert.ok(runCalc(calc, { ...d, area: '4*' }).errors.area);
});

test('забор: ширина откатных ворот не нужна, если откатных ворот нет', () => {
  const calc = getCalculator('fence-pro')!;
  const d = defaults(calc.fields);
  assert.ok(!visibleFields(calc, { ...d, slideGates: 0 }).some((f) => f.key === 'slideW'));
  assert.ok(visibleFields(calc, { ...d, slideGates: 1 }).some((f) => f.key === 'slideW'));
  assert.ok(CALCULATORS.length > 20);
});
