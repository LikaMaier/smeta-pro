import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName } from '../shared/names';

test('сопоставление названий из прайса и мастера', () => {
  assert.equal(normName('Труба профильная 60×60 (столб)'), normName('труба профильная 60x60 столб'));
  assert.equal(normName('Пескобетон М300 (40 кг)'), normName('ПЕСКОБЕТОН  М300, 40 кг'));
  assert.equal(normName('Плёнка'), normName('Пленка'));
  assert.notEqual(normName('Профиль 60×27'), normName('Профиль 60×20'));
});
