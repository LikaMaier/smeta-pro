import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READY_TEMPLATES } from '../shared/readyTemplates';
import { TEMPLATES } from '../shared/templates';
import { DIRECTIONS, searchKinds } from '../shared/directions';
import { calcEstimate } from '../shared/estimate';
import { COUNT_UNIT } from '../shared/masters';

test('готовые сметы: собираются, у всех позиций есть цена, штучное — целым числом, итог разумный', () => {
  assert.ok(READY_TEMPLATES.length >= 60);
  for (const t of READY_TEMPLATES) {
    const ls = t.lines;
    assert.ok(ls.length >= 4, `${t.id}: мало позиций`);
    for (const l of ls) {
      assert.ok((l.price || 0) > 0, `${t.id}: нет цены у «${l.name}»`);
      assert.ok(l.qty > 0, `${t.id}: количество 0 у «${l.name}»`);
      if (COUNT_UNIT.test(l.unit)) assert.ok(Number.isInteger(l.qty), `${t.id}: дробное ${l.qty} ${l.unit} у «${l.name}»`);
    }
    const total = calcEstimate(ls.map((l) => ({ qty: l.qty, price: l.price || 0, type: l.type, category: l.category }))).total;
    assert.ok(total > 5000 && total < 5e6, `${t.id}: итог ${total}`);
  }
});

test('шаблоны: id уникальны, у каждого группа', () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TEMPLATES) assert.ok(t.group, t.id);
});

test('направления: id видов работ не повторяются внутри направления, новые находятся поиском', () => {
  for (const d of DIRECTIONS) {
    const ids = d.kinds.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length, d.id);
  }
  const ids = (q: string) => searchKinds(q, 20).map((x) => x.k.id);
  assert.ok(ids('однушка').includes('t:flat1-turnkey'));
  assert.ok(ids('теплица').includes('d-gh-36'));
  assert.ok(ids('санузел под ключ').includes('t:bath-turnkey'));
  assert.ok(ids('баня из бруса').some((x) => x === 't:bath-timber' || x === 'm-house:bathb'));
});
