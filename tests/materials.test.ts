import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMaterials, materialBase } from '../server/src/materialBase';
import { normText, queryTerms } from '../shared/materialSearch';

test('база материалов «Петрович»: загружается и ищет по-строительному', () => {
  const b = materialBase();
  assert.ok(b.rows.length > 40000);
  assert.equal(b.date, '2026-10-13');
  assert.match(findMaterials('осб 12', 1)[0].name, /OSB-3 12х1250х2500/);
  assert.match(findMaterials('гипсокартон 12,5', 1)[0].name, /^ГКЛ .*12,5/);
  assert.match(findMaterials('керамогранит 60х60', 1)[0].name, /600х600/); // сантиметры → миллиметры
  assert.match(findMaterials('минвата 50', 1)[0].name, /\b50х600/);       // «50», а не «150»
  assert.ok(findMaterials('ламинат 33 класс', 1)[0].perM2! > 0);           // цена за м² из упаковки
  assert.deepEqual(findMaterials('я', 5).length >= 0, true);
});
test('нормализация размеров и запятых', () => {
  assert.equal(normText('Плита 12 х 1250×2500, 12,5 мм'), 'плита 12x1250x2500, 12.5 мм');
  assert.deepEqual(queryTerms('для ОСБ по 9'), [['osb'], ['9']]);
});
