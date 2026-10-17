import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoReply, isSpam, needsHuman, fallbackReply } from '../shared/igReplies';
test('ig autoReply', () => {
  assert.match(autoReply('Сколько стоит?')!, /199/);
  assert.match(autoReply('а на айфоне работает')!, /скачивать/);
  assert.match(autoReply('🔥🔥🔥')!, /./);
  assert.match(autoReply('Ахахах жиза!!')!, /./);
  assert.equal(autoReply('а можно считать кровлю из металлочерепицы?'), null);
  assert.equal(autoReply('подпишись на мой канал t.me/xxx'), null);
  assert.ok(isSpam('Взаимные подписки?'));
  assert.ok(needsHuman('у меня не открывается бот'));
  assert.match(fallbackReply('x'), /CMETA_Pro_bot/);
});
