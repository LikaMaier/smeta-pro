import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITIONS } from '../shared/compositions';
import { STARTER_PRICES } from '../shared/starterPrices';
import { TEMPLATES } from '../shared/templates';

test('состав работ привязан к реальным позициям справочника', () => {
  const names = new Set(STARTER_PRICES.map((p) => p.name));
  const missing = Object.keys(COMPOSITIONS).filter((n) => !names.has(n));
  assert.deepEqual(missing, []);
  assert.ok(Object.keys(COMPOSITIONS).length >= 80);
});

test('у работ «под ключ» из шаблонов есть состав', () => {
  const keyWorks = TEMPLATES.flatMap((t) => t.lines).filter((l) => l.type === 'work' && /под ключ/.test(l.name));
  for (const l of keyWorks) assert.ok(COMPOSITIONS[l.name], `нет состава: ${l.name}`);
});
