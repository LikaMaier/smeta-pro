import { env, assertEnv } from './env';
import { buildApp } from './app';
import { createBot, setupBot } from './bot';
import { seedPlans } from './routes/billing';
import { prisma } from './util';
import { startReminderLoop } from './routes/organizer';
import { COMPOSITIONS } from '../../shared/compositions';

/** Стартовым позициям справочника без состава — добавить типовой «в составе» (свои позиции не трогаем) */
async function backfillCompositions() {
  for (const [name, list] of Object.entries(COMPOSITIONS)) {
    await prisma.catalogItem.updateMany({ where: { name, description: null, notes: { startsWith: 'Примерная цена' } }, data: { description: list.join('\n') } });
  }
}

async function main() {
  assertEnv();
  await seedPlans();
  backfillCompositions().catch((e) => console.error('backfill compositions', e));
  const bot = createBot();
  if (bot) await bot.init();
  const app = await buildApp({ bot });
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  if (bot) {
    // Ошибка настройки бота не должна ронять приложение
    setupBot(bot).catch((e) => app.log.error({ err: e }, 'Не удалось настроить бота'));
    startReminderLoop(bot, app.log, env.PUBLIC_URL);
  } else {
    app.log.warn('BOT_TOKEN не задан — бот и оплата отключены');
  }
  const stop = async () => { await app.close(); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
