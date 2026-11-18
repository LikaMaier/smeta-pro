// Пример сценария: главная → сметы → смета → «Добавить работу»
export const SEED = { estimatesTotal: 1, earned: 84000, estimates: [
  { title: 'Ламинат 24 м²', customer: 'Ирина Соколова', address: 'СПб, ул. Савушкина, 12-45', lines: [
    { name: 'Укладка ламината', qty: 24, unit: 'м²', price: 580, category: 'Покрытие' },
    { name: 'Монтаж плинтуса МДФ', qty: 19.6, unit: 'пог. м', price: 450, category: 'Покрытие' },
    { name: 'Ламинат 33 класс (+7%)', qty: 25.68, unit: 'м²', price: 1070, type: 'material', category: 'Покрытие: материалы', unconfirmed: true, note: 'Примерная цена — проверьте' },
  ] },
] };
export default async ({ page, shot, go }) => {
  await go('/', SEED); await shot('home');
  await go('/estimates'); await page.getByText('Ламинат 24 м²').click(); await page.waitForTimeout(700); await shot('editor', true);
  await page.getByText('Добавить работу').click(); await page.waitForTimeout(600); await shot('add');
  await go('/calculators/m-floor'); await shot('calc');
};
