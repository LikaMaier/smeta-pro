import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEstimate } from '../shared/estimateCheck';

test('проверка: нулевые цены, количество, примерные цены, график ≠ 100%', () => {
  const r = checkEstimate({ title: 'Новая смета', customer: '', lines: [
    { name: 'Бетон', qty: 0, price: 7200, unit: 'м³' }, { name: 'Монтаж', qty: 1, price: 0, unit: 'шт' },
    { name: 'Забор', qty: 10, price: 0, matPrice: 500, unit: 'м', note: 'Примерная цена — проверьте' },
  ], paySchedule: [{ title: 'Аванс', pct: 50 }] });
  const t = r.map((x) => x.text).join(' | ');
  assert.match(t, /Нет цены: позиции 2/);
  assert.match(t, /Не указано количество: позиции 1/);
  assert.match(t, /Примерные цены.*3/);
  assert.match(t, /50%/);
  assert.match(t, /Не указан заказчик/);
});

test('хорошая смета — без ошибок', () => {
  const r = checkEstimate({ title: 'Забор 105 м', customer: 'Мария', address: 'КП Созвездие', lines: [{ name: 'Забор', qty: 105, price: 1145, matPrice: 1122, unit: 'м' }] });
  assert.equal(r.filter((x) => x.level === 'error').length, 0);
});

test('проверки как у сметчиков: НДС, запас, вывоз мусора, доставка', () => {
  const lines = [
    { name: 'Укладка плитки', qty: 20, price: 1500, matPrice: 1200, unit: 'м²' },
    { name: 'Грунтовка', qty: 20, price: 60, unit: 'м²' },
    { name: 'Затирка швов', qty: 20, price: 200, unit: 'м²' },
  ];
  const r = checkEstimate({ title: 'Санузел', customer: 'Мария', address: 'СПб', lines, params: { taxPct: 20 } });
  const t = r.map((x) => x.text).join(' | ');
  assert.match(t, /НДС/); assert.match(t, /запаса материала/); assert.match(t, /вывоза мусора/); assert.match(t, /доставка и подъём/);
  const ok = checkEstimate({ title: 'Санузел', customer: 'Мария', address: 'СПб', lines: [...lines, { name: 'Вывоз мусора', qty: 1, price: 3000, unit: 'рейс' }], params: { taxPct: 6, lossReservePct: 7, delivery: 2000 } });
  assert.deepEqual(ok, []);
});
