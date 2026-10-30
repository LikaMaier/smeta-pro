import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeIn } from '../shared/igCode';

test('бонус за Instagram: код из комментария', () => {
  assert.equal(codeIn('12345'), '12345');
  assert.equal(codeIn('Подписался! код 48213 🙌'), '48213');
  assert.equal(codeIn('PRO-77001'), '77001');
  assert.equal(codeIn('сделали за 120000 рублей'), null);
  assert.equal(codeIn('1234'), null);
  assert.equal(codeIn('крутое видео'), null);
});
