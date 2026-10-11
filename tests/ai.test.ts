import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft, calculatorsForPrompt, AiReply } from '../shared/aiDraft';

const reply: AiReply = {
  reply: 'Черновик готов', status: 'draft', known: ['площадка 6×4 м', 'толщина 15 см'], assumptions: [],
  calculations: [{ id: 'concrete-slab', values: [{ key: 'a', value: '6' }, { key: 'b', value: '4' }, { key: 't', value: '15' }] }],
  items: [
    { name: 'Бетон М300', unit: 'м³', type: 'material', category: 'Бетон', qty: null, fromCalc: { calc: 0, row: 'Бетон с запасом' }, note: null },
    { name: 'Бетонирование плиты/площадки', unit: 'м³', type: 'work', category: 'Бетон', qty: null, fromCalc: { calc: 0, row: 'Бетон без запаса' }, note: null },
    { name: 'Доставка бетона', unit: 'рейс', type: 'service', category: 'Доставка', qty: 1, fromCalc: null, note: null },
    { name: 'Армирование', unit: 'м²', type: 'work', category: 'Бетон', qty: null, fromCalc: null, note: null },
  ],
};

test('ИИ: количества берутся из калькулятора, а не от модели', () => {
  const { lines, problems } = buildDraft(reply, {
    catalog: [{ id: 'c1', name: 'Бетон М300', unit: 'м³', price: 7200, costPrice: 6400 }],
    approx: [{ name: 'Бетонирование плиты/площадки', unit: 'м³', price: 3500 }],
  });
  assert.deepEqual(problems, []);
  assert.equal(lines[0].qty, 3.6);          // запас по умолчанию 0%
  assert.equal(lines[0].price, 7200);
  assert.equal(lines[0].priceSource, 'catalog');
  assert.equal(lines[0].unconfirmed, false);
  assert.equal(lines[1].qty, 3.6);
  assert.equal(lines[1].priceSource, 'approx');
  assert.equal(lines[1].unconfirmed, true);
  assert.equal(lines[2].qty, 1);
  assert.equal(lines[2].price, 0);           // цену не придумываем
  assert.equal(lines[3].qty, 0);
  assert.match(lines[3].note!, /Количество не определено/);
});

test('ИИ: неизвестный калькулятор и нехватка данных дают проблемы', () => {
  const r = { ...reply, calculations: [{ id: 'nope', values: [] }, { id: 'mix-recipe', values: [{ key: 'v', value: '1' }] }], items: [] };
  const { problems } = buildDraft(r as any, { catalog: [], approx: [] });
  assert.equal(problems.length, 2);
});

test('описание калькуляторов для модели содержит все id', () => {
  const s = calculatorsForPrompt();
  assert.ok(s.includes('concrete-slab') && s.includes('septic') && s.includes('fence'));
});
