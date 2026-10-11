import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_PRICES } from '../shared/starterPrices';

test('стартовые цены: уникальные названия, положительные цены, единицы указаны', () => {
  const names = new Set<string>();
  for (const p of STARTER_PRICES) {
    assert.ok(p.price > 0, p.name);
    assert.ok(p.unit && p.category, p.name);
    assert.ok(!names.has(p.name.toLowerCase()), `дубль: ${p.name}`);
    names.add(p.name.toLowerCase());
  }
  assert.ok(STARTER_PRICES.length >= 80);
});
