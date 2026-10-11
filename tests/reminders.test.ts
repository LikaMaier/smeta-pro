import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun } from '../shared/reminders';

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
