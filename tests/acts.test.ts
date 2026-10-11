import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress, buildAct, lineKey, priceFactor } from '../shared/acts';

const lines = [
  { key: lineKey({ name: 'Забор', unit: 'м' }), name: 'Забор', unit: 'м', qty: 105, amount: 238035 },
  { key: lineKey({ name: 'Ворота', unit: 'компл' }), name: 'Ворота', unit: 'компл', qty: 1, amount: 82207 },
];

test('промежуточный акт: выполнено 60 из 105 м, остаток 45', () => {
  const rows = progress(lines, [], 1);
  const a = buildAct(rows, { [lines[0].key]: 60 });
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].unitPrice, 2267);
  assert.equal(a.subtotal, 136020);
  const after = progress(lines, [{ items: a.items }], 1);
  assert.equal(after[0].done, 60);
  assert.equal(after[0].left, 45);
  assert.equal(after[0].pct, 57.1);
});

test('нельзя закрыть больше, чем осталось; удалённый акт не считается', () => {
  const rows = progress(lines, [{ items: [{ key: lines[1].key, name: 'Ворота', unit: 'компл', qty: 1, unitPrice: 82207, amount: 82207 }] }], 1);
  const a = buildAct(rows, { [lines[1].key]: 1 });
  assert.equal(a.items.length, 0);
  const rows2 = progress(lines, [{ items: [{ key: lines[1].key, name: 'Ворота', unit: 'компл', qty: 1, unitPrice: 82207, amount: 82207 }], deletedAt: new Date() }], 1);
  assert.equal(rows2[1].left, 1);
});

test('цены акта включают наценку и скидку пропорционально, налог сверху', () => {
  const k = priceFactor(1000, 1100); // наценка 10%
  const rows = progress([{ key: 'a|шт', name: 'A', unit: 'шт', qty: 10, amount: 1000 }], [], k);
  const a = buildAct(rows, { 'a|шт': 10 }, 20);
  assert.equal(a.subtotal, 1100);
  assert.equal(a.tax, 220);
  assert.equal(a.total, 1320);
});
