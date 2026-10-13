import { env, assertEnv } from './env';
import { buildApp } from './app';
import { createBot, setupBot } from './bot';
import { seedPlans } from './routes/billing';
import { prisma } from './util';
import { startReminderLoop } from './routes/organizer';
import { startAdminReports } from './stats';
import { notifyAiWishers } from './routes/ai';
import { COMPOSITIONS, compositionFor } from '../../shared/compositions';
import { STARTER_PRICES } from '../../shared/starterPrices';

/** Новые позиции стартового справочника — тем, кто им пользуется (по названию, без дублей) */
async function backfillStarter() {
  const users = await prisma.catalogItem.groupBy({ by: ['userId', 'priceListId'], where: { deletedAt: null, notes: { startsWith: 'Примерная цена' } }, _count: true });
  for (const u of users) {
    if (u._count < 50) continue;
    const have = new Set((await prisma.catalogItem.findMany({ where: { userId: u.userId, priceListId: u.priceListId }, select: { name: true } })).map((i) => i.name.toLowerCase()));
    const add = STARTER_PRICES.filter((p) => !have.has(p.name.toLowerCase()));
    if (!add.length) continue;
    await prisma.catalogItem.createMany({
      data: add.map((r) => ({
        userId: u.userId, priceListId: u.priceListId, name: r.name, category: r.category, unit: r.unit, price: r.price,
        type: r.category === 'Аренда техники' ? 'equipment' : r.name.startsWith('Вывоз') || r.category === 'Доставка' ? 'service' : 'work',
        notes: 'Примерная цена — проверьте и поправьте под свой регион', params: { starter: true }, description: compositionFor(r.name)?.join('\n') ?? null,
      })),
    });
  }
}

/** Стартовым позициям справочника без состава — добавить типовой «в составе» (свои позиции не трогаем) */
async function backfillCompositions() {
  for (const [name, list] of Object.entries(COMPOSITIONS)) {
    await prisma.catalogItem.updateMany({ where: { name, description: null, notes: { startsWith: 'Примерная цена' } }, data: { description: list.join('\n') } });
  }
}

async function main() {
  assertEnv();
  await seedPlans();
  backfillCompositions().then(backfillStarter).catch((e) => console.error('backfill catalog', e));
  const bot = createBot();
  if (bot) await bot.init();
  const app = await buildApp({ bot });
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  if (bot) {
    // Ошибка настройки бота не должна ронять приложение
    setupBot(bot).catch((e) => app.log.error({ err: e }, 'Не удалось настроить бота'));
    startReminderLoop(bot, app.log, env.PUBLIC_URL);
    startAdminReports(bot, app.log);
    notifyAiWishers(bot, env.PUBLIC_URL, app.log).catch((e) => app.log.error({ err: e }, 'ai wish notify'));
  } else {
    app.log.warn('BOT_TOKEN не задан — бот и оплата отключены');
  }
  const stop = async () => { await app.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
