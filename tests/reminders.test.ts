import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun, preTime } from '../shared/reminders';

test('один раз — нет следующего', () => {
  assert.equal(nextRun(new Date('2026-10-11T05:00:00Z'), 'none'), null);
});

test('каждый день — ближайшее после now, время сохраняется', () => {
  const n = nextRun(new Date('2026-10-01T05:00:00Z'), 'daily', new Date('2026-10-11T06:00:00Z'))!;
  assert.equal(n.toISOString(), '2026-10-12T05:00:00.000Z');
});

test('каждую неделю', () => {
  const n = nextRun(new Date('2026-10-05T05:00:00Z'), 'weekly', new Date('2026-10-05T05:00:00Z'))!;
  assert.equal(n.toISOString(), '2026-10-12T05:00:00.000Z');
});

test('каждый месяц 31-го → 30 ноября', () => {
  const n = nextRun(new Date('2026-10-31T06:00:00Z'), 'monthly', new Date('2026-10-31T07:00:00Z'))!;
  assert.equal(n.toISOString(), '2026-11-30T06:00:00.000Z');
});

test('по будням: пятница → понедельник (МСК)', () => {
  // пт 16.10.2026 09:00 МСК = 06:00Z
  const n = nextRun(new Date('2026-10-16T06:00:00Z'), 'weekdays', new Date('2026-10-16T06:00:30Z'), { tz: 180 })!;
  assert.equal(n.toISOString(), '2026-10-19T06:00:00.000Z');
});

test('по дням недели: вт и чт, день недели по местному времени', () => {
  // пн 12.10 в 00:30 МСК = вс 11.10 21:30Z: по UTC это воскресенье, по Москве — понедельник
  const n = nextRun(new Date('2026-10-11T21:30:00Z'), 'days', new Date('2026-10-11T21:31:00Z'), { tz: 180, days: [2, 4] })!;
  assert.equal(n.toISOString(), '2026-10-12T21:30:00.000Z'); // вт 13.10 00:30 МСК
});

test('по дням: будущее время в неподходящий день переносится', () => {
  const n = nextRun(new Date('2026-10-17T06:00:00Z'), 'days', new Date('2026-10-12T06:00:00Z'), { tz: 180, days: [1] })!; // сб → пн
  assert.equal(n.toISOString(), '2026-10-19T06:00:00.000Z');
});

test('раз в квартал и раз в год', () => {
  assert.equal(nextRun(new Date('2026-07-25T07:00:00Z'), 'quarterly', new Date('2026-07-25T08:00:00Z'))!.toISOString(), '2026-10-25T07:00:00.000Z');
  assert.equal(nextRun(new Date('2028-02-29T07:00:00Z'), 'yearly', new Date('2028-02-29T08:00:00Z'))!.toISOString(), '2029-02-28T07:00:00.000Z');
  assert.equal(nextRun(new Date('2026-10-01T07:00:00Z'), 'biweekly', new Date('2026-10-01T08:00:00Z'))!.toISOString(), '2026-10-15T07:00:00.000Z');
});

test('месяц: 1-е число в 00:30 МСК остаётся 1-м', () => {
  // 1 ноября 00:30 МСК = 31 октября 21:30Z
  const n = nextRun(new Date('2026-10-31T21:30:00Z'), 'monthly', new Date('2026-10-31T21:31:00Z'), { tz: 180 })!;
  assert.equal(n.toISOString(), '2026-11-30T21:30:00.000Z'); // 1 декабря 00:30 МСК
});

test('предупреждение заранее', () => {
  const at = new Date('2026-10-20T06:00:00Z');
  assert.equal(preTime(at, 1440, new Date('2026-10-12T00:00:00Z'))!.toISOString(), '2026-10-19T06:00:00.000Z');
  assert.equal(preTime(at, 1440, new Date('2026-10-19T07:00:00Z')), null);
  assert.equal(preTime(at, 0), null);
});
