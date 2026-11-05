import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normPhone, priceOverrides, calcJobIds, cleanInput, calcLines, toEstimateLines } from '../shared/leadCalc';
import { STARTER_PRICES } from '../shared/starterPrices';
import { jobDefaults, getJob, jobTotals, DEFAULT_JOBS } from '../shared/firstJobs';
import { normName } from '../shared/names';

test('калькулятор для заказчиков: телефон — российский в любом виде, международный с плюсом, мусор — нет', () => {
  assert.equal(normPhone('8 921 123-45-67'), '+7 921 123-45-67');
  assert.equal(normPhone('+7 (921) 123 45 67'), '+7 921 123-45-67');
  assert.equal(normPhone('9211234567'), '+7 921 123-45-67');
  assert.equal(normPhone('8 (812) 600-00-00'), '+7 812 600-00-00');
  assert.equal(normPhone('+375 29 123 45 67'), '+375291234567');
  for (const bad of ['', '12345', '921 12 34', 'позвоните мне', '+7 921', '123456789012345678']) assert.equal(normPhone(bad), null, bad);
});

test('калькулятор: на страницу заказчика уходят только свои цены мастера, стартовые — нет', () => {
  const s = STARTER_PRICES[0];
  const own = priceOverrides([
    { name: s.name, price: s.price }, // не менял
    { name: STARTER_PRICES[1].name, price: STARTER_PRICES[1].price + 100 }, // поменял
    { name: 'Плиточный клей (25 кг)', price: '650' }, // свой материал
    { name: 'Выключенная позиция', price: 10, active: false },
    { name: 'Без цены', price: 0 },
  ]);
  assert.deepEqual(Object.keys(own).sort(), [normName(STARTER_PRICES[1].name), normName('Плиточный клей (25 кг)')].sort());
  assert.equal(own[normName('Плиточный клей (25 кг)')], 650);
});

test('калькулятор: свои цены мастера меняют итог, размеры из запроса — в пределах, лишние поля отброшены', () => {
  const job = getJob('bath')!;
  const d = jobDefaults(job);
  const base = calcLines('bath', d.sizes, d.opts, 'std', {});
  const glue = base.find((l) => /клей/i.test(l.name))!;
  const mine = calcLines('bath', d.sizes, d.opts, 'std', { [normName(glue.name)]: glue.price * 2 });
  assert.ok(jobTotals(mine).total > jobTotals(base).total);
  const c = cleanInput('bath', { L: 999, W: 'abc', hack: 5 }, { demo: false, evil: true })!;
  assert.equal(c.sizes.L, job.size[0].max);
  assert.equal(c.sizes.W, job.size[1].def);
  assert.equal('hack' in c.sizes, false);
  assert.deepEqual(Object.keys(c.opts).sort(), ['ceil', 'demo', 'plumb']);
  assert.equal(c.opts.demo, false);
  assert.equal(cleanInput('нет-такой', {}, {}), null);
  const rows = toEstimateLines(base);
  assert.equal(rows.length, base.length);
  assert.ok(rows.every((r, i) => r.position === i && r.qty > 0 && r.price > 0));
});

test('калькулятор: работы — выбранные мастером (без несуществующих и дублей), иначе по специальности', () => {
  assert.deepEqual(calcJobIds(['bath', 'нет', 'bath', 'roof']), ['bath', 'roof']);
  assert.deepEqual(calcJobIds(null, 'roof').slice(0, 2), ['roof', 'roof-new']);
  assert.deepEqual(calcJobIds([], null), DEFAULT_JOBS);
});
