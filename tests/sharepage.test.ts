import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePage } from '../server/src/sharePage';

const d = {
  company: 'ИП <Майер>', contacts: '+7 900', grouped: true,
  lines: [{ name: 'Бетон М300', category: 'Бетон', qty: 3.78, unit: 'м³', price: 7200, amount: 27216 }, { name: 'Бордюр', category: null, qty: 20, unit: 'пог. м', price: 650, amount: 13000 }],
  totals: { works: 13000, materials: 27216, other: 0, overhead: 0, delivery: 0, extraCosts: 0, discount: 0, discountPct: 0, tax: 0, taxPct: 0, total: 40216 },
};
const meta = { token: 'abcdefghijklmnopqrstuv', number: 3, hasLogo: false, approvedAt: null, title: 'Площадка "6×4"', customer: 'Иванов', address: null, date: new Date('2026-10-11'), validDays: 14, paymentTerms: 'Аванс 50%', notes: null, botUrl: 'https://t.me/x' };

test('страница заказчика: позиции, итог, кнопка согласования, экранирование', () => {
  const html = estimatePage(d, meta);
  assert.match(html, /Согласовать смету/);
  assert.match(html, /Бетон М300/);
  assert.match(html, /ИП &lt;Майер&gt;/);
  assert.match(html, /Площадка &quot;6×4&quot;/);
  assert.doesNotMatch(html, /costPrice|себестоим/i);
});

test('согласованная смета — без кнопки, с отметкой', () => {
  const html = estimatePage(d, { ...meta, approvedAt: new Date('2026-10-12') });
  assert.doesNotMatch(html, /id="ok"/);
  assert.match(html, /Смета согласована/);
});
