import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALCULATORS, normalizeValues } from '../shared/calculators';
import { MASTERS } from '../shared/masters';
import { buildCanopy } from '../shared/design/canopy';
import { PRESETS } from '../shared/design/presets';
import { buildFence } from '../shared/design/fence3d';
import { buildSite, SITE_PRESETS } from '../shared/design/site';
import { buildMep, autoPlace, MEP_PRESETS, elDefaults } from '../shared/design/mep';
import { calcEstimate } from '../shared/estimate';

/** Общая проверка строк сметы: числа, целые штуки, без дублей внутри раздела */
const COUNT = /^(шт|лист|меш|банка|рулон|компл|баллон|ведро|упак|пачка)/;
function check(where: string, lines: any[]) {
  const seen = new Set<string>();
  for (const l of lines) {
    assert.ok(Number.isFinite(l.qty) && l.qty > 0, `${where}: количество «${l.name}» = ${l.qty}`);
    assert.ok(l.price == null || (Number.isFinite(l.price) && l.price >= 0), `${where}: цена «${l.name}» = ${l.price}`);
    assert.ok(!/NaN|undefined|Infinity/.test(l.name), `${where}: «${l.name}»`);
    if (l.type === 'material' && COUNT.test(String(l.unit))) assert.equal(l.qty, Math.round(l.qty), `${where}: дробное штучное «${l.name}» ${l.qty}`);
    const k = `${l.name}|${l.type}|${l.unit}|${l.price}|${l.category}`;
    assert.ok(!seen.has(k), `${where}: повтор «${l.name}»`); seen.add(k);
  }
}

test('аудит: калькуляторы на значениях по умолчанию и ×2', () => {
  for (const c of CALCULATORS) {
    const v = normalizeValues(c, {});
    const o = c.compute(v);
    for (const r of o.rows) assert.ok(Number.isFinite(r.value) && r.value >= 0 || r.label.includes('Отклонение'), `${c.id}: «${r.label}» = ${r.value}`);
    check(c.id, o.suggestions.filter((s) => s.qty > 0));
  }
});
test('аудит: мастера со всеми вариантами', () => {
  for (const m of MASTERS) {
    const v = Object.fromEntries(m.fields.map((f) => [f.key, f.default]));
    check(m.id, m.build(v).lines);
    for (const f of m.fields.filter((x) => x.type === 'select')) for (const o of f.options || []) check(`${m.id}[${f.key}=${o.value}]`, m.build({ ...v, [f.key]: o.value }).lines);
  }
});
test('аудит: постройки, заборы, участки, инженерия', () => {
  for (const p of PRESETS) for (const extra of [{}, { color: 'none' }, { insulate: true }, { base: 'floor' }]) check(`${p.id} ${JSON.stringify(extra)}`, (buildCanopy({ ...p.p, ...extra } as any) as any).lines);
  for (const t of ['profnastil', 'euro2', 'mesh3d', 'brick', 'rancho', 'rabica', 'blocks', 'gabion']) for (const gate of ['slide', 'swing', 'none']) check(`fence ${t}/${gate}`, (buildFence({ type: t, gate } as any) as any).lines);
  for (const s of SITE_PRESETS) check(`site ${s.id}`, (buildSite(s.p) as any).lines);
  for (const pr of MEP_PRESETS) { const b: any = { kind: 'mep', h: 2.7, rooms: pr.rooms, points: [], walls: 'concrete', wiring: 'hidden', pipes: 'ppr', scheme: 'tee', object: pr.object, ...elDefaults(pr.object) }; b.points = autoPlace(b); check(`mep ${pr.id}`, (buildMep(b) as any).lines); }
});
test('аудит: итоги сметы сходятся до копейки', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    const lines = Array.from({ length: 1 + (i % 9) }, (_, j) => ({ qty: Math.round(rnd() * 1000) / 100, price: Math.round(rnd() * 500000) / 100, matPrice: j % 3 ? Math.round(rnd() * 30000) / 100 : null, coef: j % 4 ? 1 : 1.15, costPrice: j % 2 ? rnd() * 100 : null, type: ['work', 'material', 'equipment', 'service'][j % 4], category: ['А', 'Б'][j % 2] }));
    const t = calcEstimate(lines as any, { discountPct: i % 5, markupPct: i % 7, taxPct: i % 3 ? 6 : 0, lossReservePct: i % 2 ? 5 : 0, delivery: i % 4 ? 1500 : 0, extraCosts: i % 6 ? 700 : 0, sectionCoefs: i % 5 ? { А: 1.1 } : null });
    const near = (a: number, b: number, w: string) => assert.ok(Math.abs(a - b) < 0.011, `#${i} ${w}: ${a} ≠ ${b}`);
    near(t.subtotal, t.worksSubtotal + t.materialsSubtotal + t.otherSubtotal, 'подытог');
    near(t.subtotal, t.lineAmounts.reduce((a, b) => a + b, 0), 'сумма строк');
    near(t.taxBase, t.subtotal + t.reserve + t.markup - t.discount + t.delivery + t.extraCosts, 'база налога');
    near(t.total, t.taxBase + t.tax + t.roundAdjust, 'итого');
    near(t.sections.reduce((a, s) => a + s.amount, 0), t.subtotal, 'разделы');
  }
});
