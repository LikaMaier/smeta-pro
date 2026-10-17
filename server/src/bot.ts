import { Bot, InlineKeyboard } from 'grammy';
import { env } from './env';
import { prisma, accessOf } from './util';
import { can, TIERS } from '../../shared/plans';
import { aiConfigured, sttConfigured } from './ai/openai';
import { applyPayment } from './routes/billing';
import { upsertUser } from './routes/auth';
import { buildReport, reportTo, mskDay } from './stats';
import { botInfo } from './botInfo';
import { handleMessage } from './ai/assistant';
import { transcribe } from './ai/openai';
import { remAction } from './routes/organizer';
import { joinTeam } from './routes/team';
import { priceFor } from './routes/promo';
import { attachInstagram } from './instagram';
import { attachThreads } from './threads';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createBot() {
  if (!env.BOT_TOKEN) return null;
  const bot = new Bot(env.BOT_TOKEN);
  const appKb = () => env.PUBLIC_URL ? new InlineKeyboard().webApp('Открыть СМЕТА PRO', env.PUBLIC_URL) : undefined;

  bot.command('start', async (ctx) => {
    // Регистрируем сразу: так запоминаем, кто пригласил (ссылка t.me/бот?start=ref_…)
    const payload = String(ctx.match || '');
    // заявка с лендинга «ИИ для строительной фирмы»: t.me/бот?start=biz
    if (payload === 'biz' || payload.startsWith('biz_')) {
      const f = ctx.from!;
      const who = `${f.first_name || ''} ${f.last_name || ''}`.trim() + (f.username ? ` (@${f.username})` : '') + ` · id ${f.id}`;
      for (const id of reportTo()) await ctx.api.sendMessage(Number(id), `🏗 <b>Заявка: ИИ для строительной фирмы</b>\n${esc(who)}${payload.length > 4 ? `\nПакет: ${esc(payload.slice(4))}` : ''}\n\nНапишите ему первой: <a href="tg://user?id=${f.id}">открыть чат</a>`, { parse_mode: 'HTML' }).catch(() => {});
      await prisma.appKV.upsert({ where: { key: `biz:${f.id}` }, create: { key: `biz:${f.id}`, value: String(Date.now()) }, update: { value: String(Date.now()) } }).catch(() => {});
      return ctx.reply('Здравствуйте! 👷 Заявка принята — свяжемся с вами в ближайшее время (обычно в течение пары часов, с 9 до 21).\n\nЧтобы подготовиться к разговору, ответьте одним сообщением:\n1) Как называется фирма и чем занимаетесь?\n2) Откуда сейчас приходят заказы?\n3) Что больше всего отнимает времени — заявки, сметы, КП, соцсети?');
    }
    const u = ctx.from ? await upsertUser(ctx.from.id, ctx.from.first_name, ctx.from.username, payload).catch((e) => { console.error('upsertUser', e); return null; }) : null;
    // поддержка: t.me/бот?start=help (кнопка «Поддержка» в приложении)
    if (payload === 'help' && ctx.from) {
      await prisma.appKV.upsert({ where: { key: `sup:${ctx.from.id}` }, create: { key: `sup:${ctx.from.id}`, value: String(Date.now()) }, update: { value: String(Date.now()) } }).catch(() => {});
      return ctx.reply('💬 Поддержка СМЕТА PRO. Напишите вопрос или предложение одним сообщением — можно со скриншотом. Ответим здесь, в этом чате (обычно в течение пары часов, с 9 до 21 по Москве).');
    }
    // ссылка блогера: t.me/бот?start=p_<КОД>
    if (u && payload.startsWith('p_') && u.promoCode) {
      const pr = await prisma.promoCode.findFirst({ where: { code: u.promoCode } });
      if (pr) await ctx.reply(`🎁 Промокод <b>${esc(pr.code)}</b> применён: скидка ${pr.discountPct}% на первую оплату подписки${pr.trialDays && u.trialEndsAt > new Date() ? `, «Про» бесплатно до ${u.trialEndsAt.toLocaleDateString('ru-RU')}` : ''}.`, { parse_mode: 'HTML' }).catch(() => {});
    }
    // приглашение в бригаду: t.me/бот?start=team_<токен>
    if (u && payload.startsWith('team_')) {
      try {
        const r = await joinTeam(u.id, payload.slice(5));
        return ctx.reply(r.already ? `Вы уже в бригаде «${esc(r.owner)}».` : `👷 Вы в бригаде «${esc(r.owner)}». Доступ уровня «Бригада» и общий справочник цен уже у вас.`, { parse_mode: 'HTML', reply_markup: appKb() });
      } catch (e: any) { await ctx.reply(`Не получилось вступить в бригаду: ${e.message}`); }
    }
    await ctx.reply(welcomeText(u), { parse_mode: 'HTML', reply_markup: appKb() });
  });

  // ID для настройки администратора
  // Сводка для администратора: /stats — за сегодня, /stats 7 — за 7 дней
  bot.command('stats', async (ctx) => {
    if (!ctx.from || !reportTo().includes(String(ctx.from.id))) return;
    const days = Math.min(90, Math.max(0, Number(String(ctx.match || '').trim()) || 0));
    const now = new Date();
    const from = days ? new Date(now.getTime() - days * 864e5) : new Date(Date.parse(mskDay(now) + 'T00:00:00Z') - 3 * 3600e3);
    await ctx.reply(await buildReport(from, now), { parse_mode: 'HTML' });
  });
  bot.command('id', (ctx) => ctx.reply(`Ваш Telegram ID: <code>${ctx.from?.id}</code>`, { parse_mode: 'HTML' }));

  // Кнопки под напоминанием: отложить / готово
  bot.callbackQuery(/^rem:(15|60|180|tom|ok):([\w-]{10,40})$/, async (ctx) => {
    const [, action, id] = ctx.match as RegExpMatchArray;
    const text = await remAction(ctx.from.id, action, id).catch(() => 'Не получилось, попробуйте в приложении');
    await ctx.answerCallbackQuery({ text }).catch(() => {});
    try {
      const msg = ctx.callbackQuery.message as any;
      if (msg?.text) await ctx.editMessageText(`${esc(msg.text)}\n\n<i>${esc(text)}</i>`, { parse_mode: 'HTML' });
    } catch { /* сообщение уже изменено */ }
  });

  bot.command('app', (ctx) => ctx.reply('Открыть приложение:', { reply_markup: appKb() }));
  bot.command(['help', 'support'], async (ctx) => {
    if (ctx.from) await prisma.appKV.upsert({ where: { key: `sup:${ctx.from.id}` }, create: { key: `sup:${ctx.from.id}`, value: String(Date.now()) }, update: { value: String(Date.now()) } }).catch(() => {});
    return ctx.reply('💬 Поддержка СМЕТА PRO. Напишите вопрос одним сообщением — ответим здесь, в этом чате.');
  });
  attachInstagram(bot); // кнопки «Опубликовать» и ответы на комментарии — раньше ИИ-обработчика текста
  attachThreads(bot);
  // ответ администратора на вопрос в поддержку: ответить (reply) на сообщение бота с вопросом → уходит пользователю
  bot.on('message:text', async (ctx, next) => {
    const rt = ctx.message.reply_to_message;
    if (!rt || !ctx.from || !reportTo().includes(String(ctx.from.id))) return next();
    const kv = await prisma.appKV.findUnique({ where: { key: `sup:reply:${ctx.from.id}:${rt.message_id}` } }).catch(() => null);
    if (!kv) return next();
    try {
      await ctx.api.sendMessage(Number(kv.value), `💬 <b>Ответ поддержки СМЕТА PRO</b>\n\n${esc(ctx.message.text)}\n\n<i>Можно ответить здесь же.</i>`, { parse_mode: 'HTML', reply_markup: appKb() });
      await prisma.appKV.upsert({ where: { key: `sup:${kv.value}` }, create: { key: `sup:${kv.value}`, value: String(Date.now()) }, update: { value: String(Date.now()) } }).catch(() => {});
      await ctx.reply('✅ Ответ отправлен пользователю');
    } catch (e: any) { await ctx.reply(`⚠️ Не отправилось: ${e.message}`); }
  });
  // ответы лидов с лендинга (сутки после /start biz) — пересылаем владелице, а не ИИ-сметчику
  bot.on('message', async (ctx, next) => {
    if (!ctx.from || reportTo().includes(String(ctx.from.id)) || ctx.message.text?.startsWith('/')) return next();
    const kv = await prisma.appKV.findUnique({ where: { key: `biz:${ctx.from.id}` } }).catch(() => null);
    if (!kv || Date.now() - Number(kv.value) > 864e5) return next();
    for (const id of reportTo()) await ctx.forwardMessage(Number(id)).catch(() => {});
    if (!(await prisma.appKV.findUnique({ where: { key: `biz-ack:${ctx.from.id}` } }).catch(() => null))) {
      await prisma.appKV.create({ data: { key: `biz-ack:${ctx.from.id}`, value: '1' } }).catch(() => {});
      await ctx.reply('Спасибо! Передала — скоро напишем вам здесь, в Telegram.');
    }
  });

  // Вопросы в поддержку: после «Поддержка»/help (сутки) или если ИИ-сметчик не подключён — всё, что пишут боту, доходит до владелицы
  bot.on('message', async (ctx, next) => {
    if (!ctx.from || reportTo().includes(String(ctx.from.id)) || ctx.message.text?.startsWith('/') || (ctx.message as any).successful_payment) return next();
    const sup = await prisma.appKV.findUnique({ where: { key: `sup:${ctx.from.id}` } }).catch(() => null);
    const fresh = sup && Date.now() - Number(sup.value) < 864e5;
    if (!fresh && aiConfigured()) return next();
    const f = ctx.from;
    const who = `${esc(`${f.first_name || ''} ${f.last_name || ''}`.trim())}${f.username ? ` (@${esc(f.username)})` : ''}`;
    const body = ctx.message.text || ctx.message.caption || '';
    for (const id of reportTo()) {
      const m = await ctx.api.sendMessage(Number(id), `💬 <b>Вопрос в поддержку</b> от ${who} · <a href="tg://user?id=${f.id}">чат</a>\n\n${esc(body) || '<i>[вложение — ниже]</i>'}\n\n<i>Ответьте на это сообщение (свайп влево) — ответ уйдёт пользователю от имени бота.</i>`, { parse_mode: 'HTML' }).catch(() => null);
      if (m) await prisma.appKV.upsert({ where: { key: `sup:reply:${id}:${m.message_id}` }, create: { key: `sup:reply:${id}:${m.message_id}`, value: String(f.id) }, update: { value: String(f.id) } }).catch(() => {});
      if (!ctx.message.text) await ctx.forwardMessage(Number(id)).catch(() => {});
    }
    // подтверждение — не чаще раза в 3 часа
    const ackKey = `sup:ack:${f.id}`;
    const ack = await prisma.appKV.findUnique({ where: { key: ackKey } }).catch(() => null);
    if (!ack || Date.now() - Number(ack.value) > 3 * 3600e3) {
      await prisma.appKV.upsert({ where: { key: ackKey }, create: { key: ackKey, value: String(Date.now()) }, update: { value: String(Date.now()) } }).catch(() => {});
      await ctx.reply('Спасибо! Сообщение получили — ответим здесь, в этом чате (обычно в течение пары часов, с 9 до 21 по Москве).\n\nА смету можно собрать прямо сейчас 👇', { reply_markup: appKb() });
    }
  });

  // Голос и текст для ИИ-сметчика: учитываем переключатель и подписку
  bot.on(['message:voice', 'message:text'], async (ctx, next) => {
    if (ctx.message.text?.startsWith('/')) return next();
    const user = await prisma.user.findUnique({ where: { tgId: BigInt(ctx.from.id) } });
    if (!user) return ctx.reply('Сначала откройте приложение командой /start');
    if (!aiConfigured()) return ctx.reply('🤖 ИИ-сметчик скоро появится: смета по голосовому и тексту. Нажмите «Жду ИИ» в приложении — подключим, как только наберётся достаточно желающих. А пока смета собирается вручную за пару минут.', { reply_markup: appKb() });
    if (!can(accessOf(user).tier, 'ai')) return ctx.reply('ИИ-сметчик входит в тарифы «Про» и «Бригада». Смету можно составить и вручную в приложении.', { reply_markup: appKb() });
    if (!user.aiEnabled) return ctx.reply('ИИ-сметчик выключен. Включите его в Настройках приложения, если нужен — или составьте смету вручную.', { reply_markup: appKb() });
    if (ctx.message.voice && !sttConfigured()) return ctx.reply('Голос пока не распознаётся — напишите текстом.', { reply_markup: appKb() });
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
    if (!user || !plan || (await priceFor(user, plan)).stars !== ctx.preCheckoutQuery.total_amount) {
      return ctx.answerPreCheckoutQuery(false, 'Тариф изменился или недоступен. Откройте оплату заново.');
    }
    return ctx.answerPreCheckoutQuery(true);
  });

  bot.on('message:successful_payment', async (ctx) => {
    const p = ctx.message.successful_payment;
    const [userId, planCode, target] = p.invoice_payload.split(':');
    const user = await prisma.user.findFirst({ where: { id: userId, tgId: BigInt(ctx.from.id) } });
    if (!user) return;
    const res = await applyPayment(userId, planCode, p.total_amount, p.telegram_payment_charge_id, { target: target || null });
    if (res && res.referrer) {
      await bot.api.sendMessage(Number(res.referrer.tgId),
        `🎁 Ваш друг оформил подписку СМЕТА PRO — дарим вам месяц бесплатно!\nПодписка продлена до ${res.referrer.until.toLocaleDateString('ru-RU')}.`,
        { reply_markup: appKb() }).catch(() => {});
    }
    if (res) await ctx.reply(res.text, { reply_markup: appKb() });
  });

  bot.catch((err) => console.error('Ошибка бота:', err.error));
  return bot;
}

/** Приветствие после «Старт»: новичку — что умеем, вернувшемуся — коротко и его статус */
export function welcomeText(u: any) {
  const name = esc(u?.firstName || 'мастер');
  const isNew = !u || Date.now() - new Date(u.createdAt).getTime() < 5 * 60e3;
  const acc = u ? accessOf(u) : null;
  if (!isNew && acc) {
    const status = acc.mode === 'subscription' || acc.mode === 'team' ? `Тариф «${TIERS[acc.tier].label}» до ${new Date(acc.until).toLocaleDateString('ru-RU')}.`
      : acc.mode === 'trial' ? `Пробный «Про»: осталось ${acc.daysLeft} дн.`
      : acc.mode === 'admin' ? 'Полный доступ.' : 'Бесплатный режим: сметы, справочник, калькуляторы, напоминания.';
    return `С возвращением, ${name}! 👋\nОбъекты ждут, сметы скучают.\n\n<i>${status}</i>\n\nОткрывайте 👇`;
  }
  return `👷 Привет, ${name}! Это <b>СМЕТА PRO</b> — карманный сметчик, который не уходит на перекур.\n\n` +
    '📐 <b>Смета за 2 минуты</b> — работы и материалы с ценами уже есть, плюс 30+ калькуляторов. Excel можно отпускать в отпуск.\n' +
    '📄 <b>PDF, договор и акт</b> заказчику — в один тап, с вашим логотипом.\n' +
    '🧊 <b>3D-проекты</b>: навесы, беседки, заборы с воротами, план участка с септиком, электрика и сантехника квартиры. Заказчик крутит модель пальцем и перестаёт спрашивать «а как это будет выглядеть?».\n' +
    '💰 <b>Деньги по объектам</b>: сколько получили, сколько потратили и сколько осталось вам, а не только поставщику бетона.\n' +
    '⏰ <b>Напоминания</b>: «забрать оплату», «вернуть экскаватор» — бот напомнит, даже если вы забыли, что просили.\n' +
    '👷 <b>Бригада</b>: один справочник цен на всю команду.\n\n' +
    `🎁 Сметы — бесплатно и без ограничений${env.PRO_TRIAL_DAYS > 0 ? `, плюс ${env.PRO_TRIAL_DAYS} ${env.PRO_TRIAL_DAYS % 10 === 1 && env.PRO_TRIAL_DAYS % 100 !== 11 ? 'день' : [2, 3, 4].includes(env.PRO_TRIAL_DAYS % 10) && ![12, 13, 14].includes(env.PRO_TRIAL_DAYS % 100) ? 'дня' : 'дней'} полного тарифа «Про»: пробуйте всё, пока чай не остыл` : ''}.\n\n` +
    'Жмите кнопку ниже 👇';
}

// Видно до нажатия «Старт» (до 512 знаков) и в профиле бота (до 120 знаков)
export const BOT_DESCRIPTION =
  'СМЕТА PRO — карманный сметчик для строителей, прорабов и бригад.\n\n' +
  '📐 Смета за 2 минуты: работы и материалы с ценами\n' +
  '📄 PDF, договор и акт заказчику в один тап\n' +
  '🧊 3D навесов, заборов и плана участка — заказчик крутит пальцем\n' +
  '💰 Прибыль по каждому объекту, а не «вроде что-то заработали»\n' +
  '⏰ Напоминания про оплату, бетон и технику\n\n' +
  '🎁 Сметы — бесплатно и без ограничений. Нажмите «Старт» — Excel не обидится.';
export const BOT_SHORT = 'Смета за 2 минуты, 3D для заказчика и прибыль по объектам. Сметы — бесплатно.';

export async function setupBot(bot: Bot) {
  const me = await bot.api.getMe().catch(() => null);
  if (me?.username) botInfo.username = me.username;
  await bot.api.setMyCommands([{ command: 'start', description: 'Начать' }, { command: 'app', description: 'Открыть приложение' }]);
  // Тексты, которые видно до нажатия «Старт» и в профиле бота
  await bot.api.setMyDescription(BOT_DESCRIPTION).catch(() => {});
  await bot.api.setMyShortDescription(BOT_SHORT).catch(() => {});
  if (env.PUBLIC_URL) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'СМЕТА PRO', web_app: { url: env.PUBLIC_URL } } });
    await bot.api.setWebhook(`${env.PUBLIC_URL}/bot/webhook`, {
      secret_token: env.WEBHOOK_SECRET || undefined,
      allowed_updates: ['message', 'pre_checkout_query', 'callback_query'],
    });
  } else {
    await bot.api.deleteWebhook();
    bot.start({ allowed_updates: ['message', 'pre_checkout_query', 'callback_query'] });
  }
}
