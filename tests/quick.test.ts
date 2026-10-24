import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_PRICES } from '../shared/starterPrices';
import { parseQuick, quickIndex, QUICK_EXAMPLES } from '../shared/quick';

const ix = quickIndex(STARTER_PRICES);
const first = (t: string) => parseQuick(t, ix).map((l) => [l.match?.name, l.qty]);

test('быстрая смета: работы, количество и единицы из обычного текста', () => {
  assert.deepEqual(first('Плитка в ванной 12 м², демонтаж старой плитки'), [['Укладка плитки на стены', 12], ['Демонтаж плитки со стен', 12]]);
  assert.deepEqual(first('8 розеток'), [['Монтаж розетки/выключателя', 8]]);
  assert.deepEqual(first('Шпаклёвка и покраска стен 60 м²'), [['Шпаклёвка стен под покраску', 60], ['Покраска стен в 2 слоя', 60]]);
  assert.deepEqual(first('Поклеить обои 45 м2, покрасить потолок 18 м2'), [['Поклейка обоев', 45], ['Покраска потолка', 18]]);
  assert.deepEqual(first('положить керамогранит 60х60 на пол 15 м2; затирка'), [['Укладка керамогранита 60×60 на пол', 15], ['Затирка швов плитки на пол', 15]]);
  assert.deepEqual(first('Септик, дренаж 40 м'), [['Монтаж септика под ключ', 1], ['Дренаж фундамента под ключ', 40]]);
  assert.deepEqual(first('пробурить скважину 40 м на песок'), [['Бурение скважины на песок', 40]]);
  assert.deepEqual(first('2,5 м³ бетона на ленту'), [['Бетонирование ленты', 2.5]]);
});

test('быстрая смета: свои цены важнее примерных, непонятное — без совпадения', () => {
  const own = quickIndex([{ name: 'Укладка ламината (моя)', unit: 'м²', price: 700, own: true }, ...STARTER_PRICES]);
  assert.equal(parseQuick('ламинат 20 м²', own)[0].match?.name, 'Укладка ламината (моя)');
  assert.equal(parseQuick('абракадабра 5 шт', ix)[0]?.match ?? null, null);
  for (const ex of QUICK_EXAMPLES) assert.ok(parseQuick(ex, ix).every((l) => l.match), ex);
});
