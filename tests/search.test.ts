import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, searchRank, searchStems } from '../shared/names';
import { STARTER_PRICES } from '../shared/starterPrices';

const find = (q: string) => STARTER_PRICES.filter((p) => matchesSearch(p.name, q)).sort((a, b) => searchRank(b.name, q) - searchRank(a.name, q)).map((p) => p.name);

test('поиск работ: порядок слов и падеж не важны', () => {
  assert.equal(find('ламината укладка')[0], 'Укладка ламината');
  assert.equal(find('укладка ламината')[0], 'Укладка ламината');
  assert.ok(find('плитка пол').includes('Укладка плитки на пол'));
  assert.ok(find('розеток').includes('Монтаж розетки/выключателя'));
  assert.ok(find('штукатурка стен').slice(0, 3).includes('Штукатурка стен по маякам'));
  assert.deepEqual(searchStems('плитка на пол'), ['плит', 'пол']);
});

test('поиск работ: «е» находит «ё», совпадение с начала слова — выше', () => {
  const r = find('теплый пол');
  assert.ok(r.slice(0, 3).every((n) => /т[её]пл\S+\s.*пол|пол.*т[её]пл/i.test(n)), r.slice(0, 3).join(' | '));
  assert.ok(matchesSearch('Монтаж тёплого водяного пола', 'теплый пол'));
  assert.ok(!matchesSearch('Монтаж люстры', 'теплый пол'));
  assert.ok(matchesSearch('Что угодно', ''));
});
