import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeWriteAllowed } from '../shared/access';

const fresh = { estimateCount: 0, firstEstimateId: null };
const used = { estimateCount: 1, firstEstimateId: 'e1' };

test('первая смета бесплатно, вторая — нет', () => {
  assert.equal(freeWriteAllowed('POST', '/api/estimates', fresh), true);
  assert.equal(freeWriteAllowed('POST', '/api/estimates', used), false);
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

test('справочник цен и настройки — бесплатно; объекты, календарь, ИИ — по подписке', () => {
  assert.equal(freeWriteAllowed('POST', '/api/items', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/items/import-starter', used), true);
  assert.equal(freeWriteAllowed('PATCH', '/api/me', used), true);
  assert.equal(freeWriteAllowed('POST', '/api/projects', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/photos', used), false);
  assert.equal(freeWriteAllowed('POST', '/api/reminders', used), false);
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
