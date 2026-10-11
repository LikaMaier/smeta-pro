import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr, isExpr } from '../shared/expr';

test('формулы в количестве', () => {
  assert.equal(evalExpr('6*4+2'), 26);
  assert.equal(evalExpr('3,5×2'), 7);
  assert.equal(evalExpr('(10+12)*2,7'), 59.4);
  assert.equal(evalExpr('105 - 4 - 1'), 100);
  assert.equal(evalExpr('10/4'), 2.5);
  assert.equal(evalExpr('-5+10'), 5);
  assert.equal(evalExpr('2*(3'), null);
  assert.equal(evalExpr('1/0'), null);
  assert.equal(evalExpr('alert(1)'), null);
  assert.equal(isExpr('6*4'), true);
  assert.equal(isExpr('-5'), false);
  assert.equal(isExpr('12,5'), false);
});
