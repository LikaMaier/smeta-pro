import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelTag } from '../shared/promo';

test('метка канала из ссылки запуска', () => {
  assert.equal(channelTag('card'), 'card');
  assert.equal(channelTag('Chat_Prorab'), 'chat_prorab');
  assert.equal(channelTag('pdf'), 'pdf');
  assert.equal(channelTag('ref_abc1234567'), null);
  assert.equal(channelTag('p_BLOGER'), null);
  assert.equal(channelTag('team_xyz'), null);
  assert.equal(channelTag('biz'), null);
  assert.equal(channelTag('help'), null);
  assert.equal(channelTag(''), null);
  assert.equal(channelTag('a'), null);
  assert.equal(channelTag('привет'), null);
});
