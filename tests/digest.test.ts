import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestDue, lastWeek, digestText } from '../shared/digest';

test('итоги недели: только в понедельник после 9:00 МСК и не чаще раза в неделю', () => {
  const mon10 = new Date('2026-10-12T07:00:00Z'); // пн 10:00 МСК
  assert.equal(digestDue(mon10, null), true);
  assert.equal(digestDue(new Date('2026-10-12T05:00:00Z'), null), false); // пн 08:00 МСК
  assert.equal(digestDue(new Date('2026-10-13T07:00:00Z'), null), false); // вторник
  assert.equal(digestDue(mon10, new Date('2026-10-12T06:30:00Z')), false); // уже отправили
  assert.equal(digestDue(mon10, new Date('2026-10-05T06:30:00Z')), true);
});

test('прошлая неделя: с понедельника по понедельник по Москве', () => {
  const { from, to } = lastWeek(new Date('2026-10-12T07:00:00Z'));
  assert.equal(to.toISOString(), '2026-10-11T21:00:00.000Z');
  assert.equal(from.toISOString(), '2026-10-04T21:00:00.000Z');
});

test('текст итогов: деньги, долги, напоминания; тихая неделя — без сообщения', () => {
  const empty = { received: 0, spent: 0, unpaid: 0, photos: 0, logs: 0, estimates: 0, approved: 0, debts: [], reminders: [] };
  assert.equal(digestText(empty), null);
  const t = digestText({ ...empty, received: 120000, spent: 45000, debts: [{ name: 'Иванов', amount: 30000 }], reminders: [{ text: 'Заказать бетон', at: new Date('2026-10-13T06:00:00Z') }] })!;
  assert.match(t, /Заработано: <b>75\s000 ₽/);
  assert.match(t, /Иванов — 30\s000 ₽/);
  assert.match(t, /13\.10 09:00 — Заказать бетон/);
});
