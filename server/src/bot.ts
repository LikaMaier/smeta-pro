import { Bot, InlineKeyboard } from 'grammy';
import { env } from './env';
import { prisma, accessOf } from './util';
import { applyPayment } from './routes/billing';
import { handleMessage } from './ai/assistant';
import { transcribe } from './ai/openai';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createBot() {
  if (!env.BOT_TOKEN) return null;
  const bot = new Bot(env.BOT_TOKEN);
  const appKb = () => env.PUBLIC_URL ? new InlineKeyboard().webApp('Открыть СМЕТА PRO', env.PUBLIC_URL) : undefined;

  bot.command('start', async (ctx) => {
    await ctx.reply(
      '<b>СМЕТА PRO</b> — сметы и прибыль по объектам прямо в Telegram.\n\n' +
      '📐 Смета за 5 минут: ваш прайс, 34 калькулятора, готовые шаблоны\n' +
      '📄 PDF для заказчика в один тап\n' +
      '💰 Расходы, оплаты и реальная прибыль по каждому объекту\n' +
      '📷 Календарь с фото, напоминания, записная книжка\n\n' +
      '<b>Первая смета — бесплатно.</b> Дальше — по подписке.',
      { parse_mode: 'HTML', reply_markup: appKb() },
    );
  });

  // ID для настройки администратора
  bot.command('id', (ctx) => ctx.reply(`Ваш Telegram ID: <code>${ctx.from?.id}</code>`, { parse_mode: 'HTML' }));

  bot.command('app', (ctx) => ctx.reply('Открыть приложение:', { reply_markup: appKb() }));

  // Голос и текст для ИИ-сметчика: учитываем переключатель и подписку
  bot.on(['message:voice', 'message:text'], async (ctx, next) => {
    if (ctx.message.text?.startsWith('/')) return next();
    const user = await prisma.user.findUnique({ where: { tgId: BigInt(ctx.from.id) } });
    if (!user) return ctx.reply('Сначала откройте приложение командой /start');
    if (!accessOf(user).active) return ctx.reply('ИИ-сметчик доступен по подписке. Первая смета — бесплатно, её можно составить вручную в приложении.', { reply_markup: appKb() });
    if (!user.aiEnabled) return ctx.reply('ИИ-сметчик выключен. Включите его в Настройках приложения, если нужен — или составьте смету вручную.', { reply_markup: appKb() });
    if (!env.OPENAI_API_KEY) return ctx.reply('ИИ-сметчик ещё не подключён на сервере. Пока составьте смету вручную.', { reply_markup: appKb() });
    try {
      await ctx.replyWithChatAction('typing');
      let text = ctx.message.text || '';
      let voice = false;
      if (ctx.message.voice) {
        if (ctx.message.voice.duration > 300) return ctx.reply('Голосовое длиннее 5 минут — разбейте на части.');
        const file = await ctx.getFile();
        const res = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`);
        if (!res.ok) throw new Error('Не удалось скачать голосовое');
        text = await transcribe(Buffer.from(await res.arrayBuffer()), 'voice.ogg', 'audio/ogg');
        voice = true;
      }
      const r = await handleMessage(user, text, voice);
      const head = voice ? `🎙 <i>${esc(text)}</i>\n\n` : '';
      const kb = env.PUBLIC_URL ? { inline_keyboard: [[{ text: r.last.status === 'draft' ? 'Открыть черновик сметы' : 'Открыть ИИ-сметчик', web_app: { url: `${env.PUBLIC_URL}/assistant` } }]] } : undefined;
      await ctx.reply(head + esc(r.last.reply), { parse_mode: 'HTML', reply_markup: kb });
    } catch (e: any) {
      await ctx.reply(e?.message ? `Не получилось: ${e.message}` : 'Не получилось обработать сообщение. Попробуйте ещё раз или напишите текстом.');
    }
  });

  // ---- Оплата Telegram Stars ----
  bot.on('pre_checkout_query', async (ctx) => {
    const [userId, planCode] = (ctx.preCheckoutQuery.invoice_payload || '').split(':');
    const [user, plan] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, tgId: BigInt(ctx.from.id) } }),
      prisma.plan.findFirst({ where: { code: planCode, active: true } }),
    ]);
    if (!user || !plan || plan.starsPrice !== ctx.preCheckoutQuery.total_amount) {
      return ctx.answerPreCheckoutQuery(false, 'Тариф изменился или недоступен. Откройте оплату заново.');
    }
    return ctx.answerPreCheckoutQuery(true);
  });

  bot.on('message:successful_payment', async (ctx) => {
    const p = ctx.message.successful_payment;
    const [userId, planCode] = p.invoice_payload.split(':');
    const user = await prisma.user.findFirst({ where: { id: userId, tgId: BigInt(ctx.from.id) } });
    if (!user) return;
    await applyPayment(userId, planCode, p.total_amount, p.telegram_payment_charge_id);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await ctx.reply(`Оплата прошла. Подписка активна до ${new Date(fresh.subscriptionUntil!).toLocaleDateString('ru-RU')}.`, { reply_markup: appKb() });
  });

  bot.catch((err) => console.error('Ошибка бота:', err.error));
  return bot;
}

export const BOT_DESCRIPTION =
  'СМЕТА PRO — сметы и учёт объектов для строителей.\n\n' +
  '• Смета за 5 минут: свой прайс, калькуляторы, готовые шаблоны\n' +
  '• PDF для заказчика в один тап\n' +
  '• Расходы, оплаты и реальная прибыль по каждому объекту\n' +
  '• Календарь с фото, напоминания, записная книжка\n\n' +
  'Первая смета — бесплатно. Дальше — по подписке.';
export const BOT_SHORT = 'Сметы, расчёты и прибыль по объектам для строителей. Первая смета — бесплатно.';

export async function setupBot(bot: Bot) {
  await bot.api.setMyCommands([{ command: 'start', description: 'Начать' }, { command: 'app', description: 'Открыть приложение' }]);
  // Тексты, которые видно до нажатия «Старт» и в профиле бота
  await bot.api.setMyDescription(BOT_DESCRIPTION).catch(() => {});
  await bot.api.setMyShortDescription(BOT_SHORT).catch(() => {});
  if (env.PUBLIC_URL) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'СМЕТА PRO', web_app: { url: env.PUBLIC_URL } } });
    await bot.api.setWebhook(`${env.PUBLIC_URL}/bot/webhook`, {
      secret_token: env.WEBHOOK_SECRET || undefined,
      allowed_updates: ['message', 'pre_checkout_query'],
    });
  } else {
    await bot.api.deleteWebhook();
    bot.start({ allowed_updates: ['message', 'pre_checkout_query'] });
  }
}
