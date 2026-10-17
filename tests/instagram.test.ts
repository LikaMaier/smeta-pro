import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoReply } from '../shared/igReplies';
test('Instagram: автоответы на частые вопросы', () => {
  assert.match(autoReply('Сколько стоит?')!, /199 ₽/);
  assert.match(autoReply('а где скачать это приложение')!, /@CMETA_Pro_bot/);
  assert.match(autoReply('3д можно сделать?')!, /3D-конструктор/);
  assert.match(autoReply('🔥🔥🔥')!, /🙌/);
  assert.equal(autoReply('у меня вопрос по фундаменту на болоте'), null); // такое — владелице
});
