import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, convertDays, TIERS, monthKey, teamMonthRub, seatsOf } from '../shared/plans';
import { freeAllowance } from '../shared/access';

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
  assert.equal(TIERS.pro.designPdf, 3);
  assert.equal(TIERS.team.designPdf, Infinity);
  assert.equal(TIERS.pro.ai, 300);
  assert.equal(TIERS.team.ai, 1000);
  assert.equal(TIERS.team.seats, 3);
  assert.equal(teamMonthRub(3), 1490);
  assert.equal(teamMonthRub(5), 2070);
  assert.equal(teamMonthRub(10), 3520);
  assert.equal(seatsOf({ teamSeats: 0 }), 5); // старые подписки «Бригада» — 5 мест
  assert.equal(seatsOf({ teamSeats: 10 }), 10);
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

test('бесплатно: 3 сметы каждый месяц + старые пакеты', () => {
  const mk = (id: string, d: string) => ({ id, createdAt: new Date(d) });
  const m = (d: Date) => monthKey(d);
  const sept = [mk('a', '2026-09-02T10:00:00Z'), mk('b', '2026-09-03T10:00:00Z'), mk('c', '2026-09-04T10:00:00Z'), mk('d', '2026-09-05T10:00:00Z')];
  // сентябрь израсходован (4-я — сверх лимита), в октябре снова 3
  let a = freeAllowance(sept, 0, '2026-10', m);
  assert.equal(a.left, 3); assert.deepEqual(a.freeIds, ['a', 'b', 'c']);
  a = freeAllowance([...sept, mk('e', '2026-10-01T10:00:00Z'), mk('f', '2026-10-02T10:00:00Z'), mk('g', '2026-10-03T10:00:00Z')], 0, '2026-10', m);
  assert.equal(a.left, 0); assert.equal(a.thisMonth, 3);
  // купленный раньше пакет: 4-я сентябрьская — из пакета, остаток пакета доступен и в октябре
  a = freeAllowance(sept, 2, '2026-10', m);
  assert.deepEqual(a.freeIds, ['a', 'b', 'c', 'd']); assert.equal(a.left, 3 + 1);
});
