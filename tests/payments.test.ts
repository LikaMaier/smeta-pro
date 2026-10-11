import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payStages, DEFAULT_SCHEDULE, scheduleSum } from '../shared/payments';

test('график 50/30/20: суммы этапов = итог, оплата покрывает этапы по порядку', () => {
  const st = payStages(597570, DEFAULT_SCHEDULE, 300000);
  assert.deepEqual(st.map((s) => s.amount), [298785, 179271, 119514]);
  assert.equal(st.reduce((a, s) => a + s.amount, 0), 597570);
  assert.deepEqual(st.map((s) => s.status), ['paid', 'partial', 'due']);
  assert.equal(st[1].paid, 1215);
  assert.equal(scheduleSum(DEFAULT_SCHEDULE), 100);
});

test('копейки не теряются на нечётной сумме', () => {
  const st = payStages(100.01, [{ title: 'А', pct: 33 }, { title: 'Б', pct: 33 }, { title: 'В', pct: 34 }]);
  assert.equal(Math.round(st.reduce((a, s) => a + s.amount, 0) * 100), 10001);
});
