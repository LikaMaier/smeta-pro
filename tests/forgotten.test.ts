import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgottenFor } from '../shared/forgotten';
import { STARTER_PRICES } from '../shared/starterPrices';

test('все подсказки «часто забывают» есть в справочнике', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../shared/forgotten.ts', import.meta.url), 'utf8');
  const names = [...src.matchAll(/\['([^']+)', \//g)].map((m) => m[1]);
  const S = new Set(STARTER_PRICES.map((p) => p.name));
  const missing = names.filter((n) => !S.has(n));
  assert.deepEqual(missing, []);
  assert.ok(names.length > 60);
});

test('к плитке предлагает гидроизоляцию, к ламинату — подложку, без дублей', () => {
  const r = forgottenFor([{ name: 'Укладка плитки на пол' }, { name: 'Укладка ламината' }, { name: 'Монтаж плинтуса' }], 20).map((x) => x.name);
  assert.ok(r.includes('Гидроизоляция санузла обмазочная'));
  assert.ok(r.includes('Монтаж подложки'));
  assert.ok(!r.includes('Монтаж плинтуса'));
  assert.ok(r.includes('Вывоз строительного мусора (контейнер 8 м³)'));
  assert.ok(r.includes('Подъём материалов на этаж'));
});

test('если всё уже есть — подсказок нет', () => {
  assert.deepEqual(forgottenFor([{ name: 'Монтаж сплит-системы до 3,5 кВт' }, { name: 'Прокладка трассы кондиционера' }, { name: 'Штробление стен под кабель' }]).filter((x) => x.why === 'к кондиционеру'), []);
  assert.deepEqual(forgottenFor([]), []);
});
