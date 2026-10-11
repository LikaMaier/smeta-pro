import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, byMonth, monthGrid } from '../shared/calendar';

const ops = [
  { kind: 'income', incomeType: 'advance', amount: 50000, date: '2026-10-02T00:00:00.000Z', projectId: 'a' },
  { kind: 'income', incomeType: 'extra_work', amount: 10000, date: '2026-10-02T00:00:00.000Z', projectId: 'a' }, // не деньги
  { kind: 'expense', category: 'materials', amount: 20000, paidAmount: 15000, date: '2026-10-02T00:00:00.000Z', projectId: 'a' },
  { kind: 'income', incomeType: 'final', amount: 30000.5, date: '2026-10-15T00:00:00.000Z', projectId: 'b' },
  { kind: 'expense', category: 'labor', amount: 8000, paidAmount: 8000, date: '2026-10-15T00:00:00.000Z', projectId: 'b' },
];

test('заработано = получено − оплачено, изменения договора не считаются', () => {
  const s = summarize(ops);
  assert.equal(s.total.received, 80000.5);
  assert.equal(s.total.spent, 23000);
  assert.equal(s.total.earned, 57000.5);
  assert.equal(s.total.unpaid, 5000);
});

test('итоги по дням и объектам', () => {
  const s = summarize(ops);
  assert.equal(s.days['2026-10-02'].earned, 35000);
  assert.equal(s.days['2026-10-15'].earned, 22000.5);
  assert.equal(s.projects.a.earned, 35000);
  assert.equal(s.projects.b.received, 30000.5);
});

test('по месяцам года', () => {
  const m = byMonth([...ops, { kind: 'income', incomeType: 'advance', amount: 100, date: '2025-10-01', projectId: 'a' }], 2026);
  assert.equal(m[9].earned, 57000.5);
  assert.equal(m[0].earned, 0);
});

test('сетка месяца с понедельника', () => {
  const g = monthGrid(2026, 10); // 1 октября 2026 — четверг
  assert.deepEqual(g[0].slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(g.flat().filter(Boolean).length, 31);
  assert.equal(g.every((w) => w.length === 7), true);
});
