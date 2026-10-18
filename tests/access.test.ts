import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeWriteAllowed, freeAllowance } from '../shared/access';

const fresh = { estimateCount: 0, freeEstimateIds: [] as string[] };
const two = { estimateCount: 2, freeEstimateIds: ['e0', 'e1'] };
const used = { estimateCount: 3, freeEstimateIds: ['e0', 'e1', 'e3'] };

test('три сметы бесплатно, четвёртая — нет', () => {
  assert.equal(freeWriteAllowed('POST', '/api/estimates', fresh), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates', two), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates', used), false);
  assert.equal(freeWriteAllowed('PUT', '/api/estimates/e3', used), true);
});

test('первую смету можно править, добавлять строки и отправлять PDF', () => {
  assert.equal(freeWriteAllowed('PUT', '/api/estimates/e1', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/lines', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/pdf/send', used), true);
});

test('копировать смету, сохранять шаблон и править чужие — по подписке', () => {
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/duplicate', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/save-as-template', used), false);
  assert.equal(freeWriteAllowed('PUT', '/api/estimates/e2', used), false);
});

test('справочник, календарь и напоминания — бесплатно; объекты и ИИ — по подписке', () => {
  assert.equal(freeWriteAllowed('POST', '/api/items', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/items/import-starter', used), true);
  assert.equal(freeWriteAllowed('PATCH', '/api/me', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/projects', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/photos', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/reminders', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/team/join', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/ai/message', used), false);
});

test('PDF первой сметы — бесплатно; акт и Excel — по подписке', () => {
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/file/pdf/send', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/file/act/send', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/file/xlsx/send', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/projects/p1/xlsx/send', used), false);
});

test('импорт из Excel — как создание первой сметы; акты — по подписке', () => {
  assert.equal(freeWriteAllowed('POST', '/api/estimates/import', fresh), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/import', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/estimates/e1/acts', used), false);
  assert.equal(freeWriteAllowed('PATCH', '/api/estimates/e1/purchased', used), true);
});

test('купленный пакет смет увеличивает лимит', () => {
  assert.equal(freeWriteAllowed('POST', '/api/estimates', { estimateCount: 5, freeEstimateIds: [], limit: 13 }), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates', { estimateCount: 13, freeEstimateIds: [], limit: 13 }), false);
});

test('оплаченная отдельно смета не входит в лимит и считается без пометки', () => {
  const m = (d: Date) => d.toISOString().slice(0, 7);
  const list = [1, 2, 3, 4].map((i) => ({ id: `e${i}`, createdAt: `2027-10-0${i}T10:00:00Z`, paidAt: i === 2 ? '2027-10-05T10:00:00Z' : null }));
  const a = freeAllowance(list, 0, '2027-10', m);
  assert.equal(a.thisMonth, 3);
  assert.deepEqual(a.freeIds.sort(), ['e1', 'e2', 'e3', 'e4']);
  assert.deepEqual(a.packIds, ['e2']);
  assert.equal(a.left, 0);
});

test('старожилы без лимита, новички — 3 сметы, Лайт без договора и объектов', async () => {
  const { freeLimitFor, proOnly, FREE_LIMIT_SINCE } = await import('../shared/access');
  assert.equal(freeLimitFor('2026-10-01T10:00:00Z'), 100000);
  assert.equal(freeLimitFor(new Date(new Date(FREE_LIMIT_SINCE).getTime() + 1000)), 3);
  // смета из безлимитного периода остаётся редактируемой
  const a = freeAllowance([{ id: 'old', createdAt: '2026-10-10T10:00:00Z' }, ...[1, 2, 3, 4].map((i) => ({ id: `n${i}`, createdAt: `2027-01-0${i}T10:00:00Z` }))], 0, '2027-01', (d) => d.toISOString().slice(0, 7), 3);
  assert.ok(a.freeIds.includes('old')); assert.ok(!a.freeIds.includes('n4')); assert.equal(a.left, 0);
  assert.equal(proOnly('POST', '/api/projects'), true);
  assert.equal(proOnly('POST', '/api/ops/abc'), true);
  assert.equal(proOnly('GET', '/api/projects'), false);
  assert.equal(proOnly('GET', '/api/estimates/x1/file/contract/link'), true);
  assert.equal(proOnly('GET', '/api/estimates/x1/file/pdf/link'), false);
  assert.equal(proOnly('PUT', '/api/estimates/x1'), false);
  assert.equal(proOnly('POST', '/api/estimates/x1/doc/invoice/send'), true);
  assert.equal(proOnly('GET', '/api/estimates/x1/doc/aosr/link'), true);
});
