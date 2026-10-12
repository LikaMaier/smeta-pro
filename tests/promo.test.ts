import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCode } from '../shared/promo';

test('промокод: регистр, пробелы и лишние знаки', () => {
  assert.equal(normCode(' stroy20 '), 'STROY20');
  assert.equal(normCode('Иванов-2026!'), 'ИВАНОВ-2026');
  assert.equal(normCode('a'.repeat(40)).length, 24);
});
