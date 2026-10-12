import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petrovichQuery, petrovichUrl } from '../shared/petrovich';
test('Петрович: короткий поисковый запрос из названия материала', () => {
  assert.equal(petrovichQuery('Труба профильная 120×120×4 (столбы), хлыст 12 м'), 'Труба профильная 120x120x4');
  assert.equal(petrovichQuery('Кабель ВВГнг(А)-LS 3×2,5'), 'Кабель ВВГнг(А)-LS 3x2,5');
  assert.equal(petrovichQuery('Ворота распашные 3 × 2.5 м: каркас створок'), 'Ворота распашные 3x2.5 м');
  assert.equal(petrovichQuery('Материалы: Окно ПВХ 800×600, двухкамерный стеклопакет'), 'Окно ПВХ 800x600');
  assert.ok(petrovichUrl('Цемент М500').startsWith('https://petrovich.ru/search/?q=%D0%A6'));
  assert.ok(petrovichUrl('Цемент', 'msk').startsWith('https://moscow.petrovich.ru/'));
});
