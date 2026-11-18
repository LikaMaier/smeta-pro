import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicNote, isServiceNote } from '../shared/notes';
import { MAT_NOTE } from '../shared/masters';

test('служебные пометки не попадают заказчику', () => {
  assert.equal(publicNote('Примерная цена — проверьте'), null);
  assert.equal(publicNote('Примерная цена — проверьте; количество типовое — уточните'), null);
  assert.equal(publicNote('Количество типовое — уточните'), null);
  assert.equal(publicNote('Укажите цену'), null);
  assert.equal(publicNote('Ориентировочная цена — проверьте у поставщика'), null);
  assert.equal(publicNote('Примерная цена — проверьте и поправьте под свой регион'), null);
  assert.equal(publicNote(MAT_NOTE), null, 'пометка мастера о цене материала');
  assert.equal(publicNote(null), null);
  assert.equal(publicNote(''), null);
});

test('примечания для заказчика остаются', () => {
  assert.equal(publicNote('минвата в каркас'), 'минвата в каркас');
  assert.equal(publicNote('слой ~15 мм; Примерная цена — проверьте'), 'слой ~15 мм');
  assert.equal(publicNote('Примерная цена — проверьте; зимние работы ×1,15'), 'зимние работы ×1,15');
  assert.equal(publicNote(`${MAT_NOTE}; цвет RAL 8017`), 'цвет RAL 8017');
  // своё примечание исполнителя со словом «проверьте» — не служебное
  assert.equal(publicNote('После монтажа проверьте уровень вместе с нами'), 'После монтажа проверьте уровень вместе с нами');
  assert.equal(isServiceNote('сложность ×1,15'), false);
});
