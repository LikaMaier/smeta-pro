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

test('подсказки не срабатывают по части слова («укладка» ≠ «кладка», «защита» ≠ «щит», «котлован» ≠ «котёл»)', () => {
  const why = (names: string[]) => [...new Set(forgottenFor(names.map((name) => ({ name })), 40).map((x) => x.why))];
  // ламинат: никакой кладки, армопояса и перемычек
  const lam = forgottenFor([{ name: 'Укладка ламината' }, { name: 'Монтаж подложки' }, { name: 'Монтаж плинтуса МДФ' }, { name: 'Монтаж порогов' }], 40);
  assert.deepEqual(lam.filter((x) => x.why === 'к кладке'), []);
  assert.ok(!lam.some((x) => /армопояс|перемыч|кладк/i.test(x.name)));
  assert.ok(!why(['Прокладка кабеля']).includes('к кладке'));
  assert.ok(!why(['Защита окон и полов плёнкой']).includes('к электрике'));
  assert.ok(!why(['Монтаж гидро-ветрозащиты']).includes('к электрике'));
  assert.ok(!why(['Рытьё котлована экскаватором']).includes('к отоплению'));
  assert.ok(!why(['Настил пола из шпунтованной доски']).includes('к сантехнике'));
  assert.ok(!why(['Укладка тротуарной плитки (с основанием)']).includes('к плитке'), 'тротуарной плитке не нужна гидроизоляция санузла');
  assert.ok(!why(['Покраска забора']).includes('к отделке стен'));
  // разборка — не повод предлагать затирку и уголки
  assert.deepEqual(why(['Демонтаж плитки со стен']), []);
  // а настоящие работы — по-прежнему подсказывают
  assert.ok(why(['Кладка газобетонных блоков']).includes('к кладке'));
  assert.ok(why(['Монтаж розетки/выключателя']).includes('к электрике'));
  assert.ok(why(['Монтаж котла настенного']).includes('к отоплению'));
  assert.ok(why(['Установка ванны']).includes('к сантехнике'));
  assert.ok(why(['Монтаж пластикового окна']).includes('к окнам'));
  assert.ok(why(['Монтаж межкомнатной двери']).includes('к дверям'));
});
