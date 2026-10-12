import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, convertDays, TIERS, monthKey } from '../shared/plans';

test('возможности по уровням', () => {
  assert.equal(can('free', 'docs'), false);
  assert.equal(can('lite', 'docs'), true);
  assert.equal(can('lite', 'ai'), false);
  assert.equal(can('pro', 'ai'), true);
  assert.equal(can('pro', 'share3d'), true);
  assert.equal(can('pro', 'whiteLabel'), false);
  assert.equal(can('team', 'whiteLabel'), true);
});

test('лимиты тарифов', () => {
  assert.equal(TIERS.free.designPdf, 1);
  assert.equal(TIERS.lite.designPdf, 3);
  assert.equal(TIERS.pro.designPdf, Infinity);
  assert.equal(TIERS.pro.ai, 300);
  assert.equal(TIERS.team.ai, 1000);
  assert.equal(TIERS.team.seats, 5);
});

test('пересчёт остатка при смене тарифа', () => {
  assert.equal(convertDays(10, 390, 790), 4); // 10 дней Лайт → 4 дня Про
  assert.equal(convertDays(10, 1690, 790), 21); // Бригада → Про: дней больше
  assert.equal(convertDays(0, 390, 790), 0);
});

test('месяц счётчика — по Москве', () => {
  assert.equal(monthKey(new Date('2026-10-31T22:30:00Z')), '2026-11'); // 01:30 МСК 1 ноября
  assert.equal(monthKey(new Date('2026-10-31T20:00:00Z')), '2026-10');
});
