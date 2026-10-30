/**
 * Воронка: сообщения бота в нужный момент (каждое — один раз на человека, только днём по Москве).
 * День 0 — «Чем занимаетесь?» (в bot.ts, сразу после старта).
 * 0. Сутки без сметы — пример по его специальности и кнопка в нужного мастера.
 * A. Смета есть, но заказчику не отправлена — «отправьте ссылку, увидите, когда откроет».
 * (Заказчик согласовал — предложение тарифа прямо в уведомлении, routes/share.ts.)
 * W. 7-й день — итог недели: сметы, суммы, что видел заказчик.
 * 1. За 2 дня до конца пробного — что останется бесплатно, первый месяц со скидкой.
 * 2. Пробный закончился — Лайт за PRICES.liteFirst ₽, Про за PRICES.proFirst ₽.
 * 3. Через 5 дней — напоминание.
 * L. Через 16 дней после пробного, если так и не оплатил — скидка на 72 часа.
 * 4. Две оплаты помесячно — предложение перейти на год.
 * 5. Через 30 дней после окончания подписки — персональная скидка на 72 часа.
 */
import { bonusCode, bonusDone, bonusHowTo, igUrl, igUsername } from './igBonus';
import { prisma } from './util';
import { env } from './env';
import { PRICES } from '../../shared/plans';
import { estimateTotals } from './routes/estimates';
import { NOT_SUB } from './routes/billing';
import { tradeOf, TRADE_EXAMPLE } from '../../shared/trades';
import { FREE_ESTIMATES } from '../../shared/access';

const H = 3600e3, D = 24 * H;
const rub = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
const isAdmin = (u: { tgId: bigint }) => env.ADMIN_TG_IDS.includes(String(u.tgId));
const hadSub = async (userId: string) => (await prisma.payment.count({ where: { userId, planCode: { notIn: NOT_SUB }, status: 'paid' } })) > 0;

/** «4 сметы на 1 230 000 ₽» — то, что человек уже сделал */
async function done(userId: string) {
  const ests = await prisma.estimate.findMany({ where: { userId, deletedAt: null, isTemplate: false }, include: { lines: true }, take: 200 });
  if (!ests.length) return '';
  const sum = ests.reduce((a, e) => a + (estimateTotals(e as any).total || 0), 0);
  return `смет: ${ests.length}${sum > 0 ? ` на ${rub(sum)}` : ''}`;
}

export function startFunnel(bot: any, log: { error: (o: any, m?: string) => void; info: (m: string) => void }, appUrl: string) {
  const kb = (text: string) => (appUrl ? { reply_markup: { inline_keyboard: [[{ text, web_app: { url: `${appUrl}/settings` } }]] } } : {});
  /** «захват» поля: сообщение уйдёт один раз, даже если серверов два */
  const claim = async (id: string, field: string) => (await prisma.user.updateMany({ where: { id, [field]: null }, data: { [field]: new Date() } })).count > 0;
  const send = (u: { tgId: bigint }, text: string, button: string) =>
    bot.api.sendMessage(Number(u.tgId), text, { parse_mode: 'HTML', ...kb(button) }).catch((e: any) => log.error({ err: e }, 'funnel send'));

  /** одноразовая отметка в AppKV (для новых шагов — без полей в базе) */
  const once = (key: string) => prisma.appKV.create({ data: { key, value: String(Date.now()) } }).then(() => true).catch(() => false);
  const tradeFor = async (tgId: bigint) => tradeOf((await prisma.appKV.findUnique({ where: { key: `trade:${tgId}` } }).catch(() => null))?.value);
  const btn = (text: string, path: string) => (appUrl ? { reply_markup: { inline_keyboard: [[{ text, web_app: { url: `${appUrl}${path}` } }]] } } : {});
  const sendTo = (u: { tgId: bigint }, text: string, extra: any = {}) =>
    bot.api.sendMessage(Number(u.tgId), text, { parse_mode: 'HTML', ...extra }).catch((e: any) => log.error({ err: e }, 'funnel send'));
  const FREE_LINE = `Дальше бесплатно — ${FREE_ESTIMATES} сметы в месяц с пометкой «Сделано в СМЕТА PRO». Все ваши сметы и данные сохранятся.`;
  const OFFER_LINE = `🔹 <b>«Лайт»</b> — сметы без ограничений и с вашим логотипом: первый месяц <b>${PRICES.liteFirst} ₽</b>, дальше ${PRICES.lite} ₽.\n⭐ <b>«Про»</b> — плюс договор, акты, Excel, учёт денег и 3D-проект для заказчика каждый месяц: первый месяц <b>${PRICES.proFirst} ₽</b>, дальше ${PRICES.pro} ₽.\nБез автосписаний.`;

  const tick = async () => {
    const now = new Date();
    const mskHour = new Date(now.getTime() + 3 * H).getUTCHours();
    if (mskHour < 10 || mskHour >= 21) return; // не будим людей
    try {
      const noSub = { OR: [{ subscriptionUntil: null }, { subscriptionUntil: { lte: now } }] };
      // 0. первая смета: прошли сутки после входа, а смет нет — пример по специальности
      for (const u of await prisma.user.findMany({ where: { activateAt: null, createdAt: { lte: new Date(now.getTime() - 20 * H), gt: new Date(now.getTime() - 4 * D) }, estimates: { none: {} } }, take: 50 })) {
        if (isAdmin(u) || !(await claim(u.id, 'activateAt'))) continue;
        const t = await tradeFor(u.tgId);
        const ex = t ? TRADE_EXAMPLE[t.id] : null;
        await sendTo(u, `👷 <b>Первая смета — за 2 минуты.</b>\n${ex ? `Попробуйте на примере: <b>${ex}</b>.\n` : ''}Нажмите кнопку → ответьте на 2–3 вопроса (размеры) → работы, материалы и цены посчитаются сами. Останется отправить заказчику.`,
          { reply_markup: appUrl ? { inline_keyboard: [[{ text: '🧾 Сделать смету', web_app: { url: `${appUrl}/new${t?.dir ? `?dir=${t.dir}` : ''}` } }], [{ text: '🏗 Постройка в 3D', web_app: { url: `${appUrl}/designer` } }]] } : undefined });
      }
      // A. смета сделана (сутки назад), но заказчику ссылку не отправляли
      for (const e of await prisma.estimate.findMany({
        where: { isTemplate: false, deletedAt: null, sharedAt: null, createdAt: { lte: new Date(now.getTime() - 20 * H), gt: new Date(now.getTime() - 5 * D) }, lines: { some: {} }, user: { createdAt: { gt: new Date(now.getTime() - 20 * D) } } },
        include: { user: true }, orderBy: { createdAt: 'asc' }, take: 50,
      })) {
        if (isAdmin(e.user) || !(await once(`fn:share:${e.userId}`))) continue;
        await sendTo(e.user, `📨 Смета «${e.title.slice(0, 60)}» готова — отправьте её заказчику <b>ссылкой</b>, а не только PDF.\nЗаказчик откроет без Telegram, нажмёт «Согласовать» или задаст вопрос — а вы сразу увидите, что он смотрел смету. Так заказ закрывается быстрее.`,
          btn('🔗 Отправить ссылку', `/estimates/${e.id}`));
      }
      // W. итог первой недели
      for (const u of await prisma.user.findMany({ where: { createdAt: { lte: new Date(now.getTime() - 7 * D), gt: new Date(now.getTime() - 9 * D) } }, take: 100 })) {
        if (isAdmin(u)) continue;
        const ests = await prisma.estimate.findMany({ where: { userId: u.id, isTemplate: false, deletedAt: null }, include: { lines: true }, take: 200 });
        if (!ests.length || !(await once(`fn:week:${u.id}`))) continue;
        const sum = ests.reduce((a, e) => a + (estimateTotals(e as any).total || 0), 0);
        const seen = ests.filter((e) => e.viewedAt).length, ok = ests.filter((e) => e.approvedAt).length;
        await sendTo(u, `📊 <b>Ваша первая неделя в СМЕТА PRO</b>\nСмет: <b>${ests.length}</b>${sum > 0 ? ` на <b>${rub(sum)}</b>` : ''}.${seen ? `\nЗаказчики открыли: ${seen}${ok ? `, согласовали: <b>${ok}</b> 🎉` : ''}.` : '\nСовет: отправляйте заказчику ссылку — увидите, когда он откроет смету.'}\n\nДо конца пробного периода — ${Math.max(0, Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / D))} дн. Пользуйтесь всем: договор, акты, учёт денег по объекту.`, btn('Открыть СМЕТА PRO', '/'));
      }
      // 1. пробный закончится через 2 дня (для коротких пробных — за сутки)
      for (const u of await prisma.user.findMany({ where: { trialWarnAt: null, trialEndsAt: { gt: now, lte: new Date(now.getTime() + 2 * D) }, createdAt: { lte: new Date(now.getTime() - 2 * D) }, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await claim(u.id, 'trialWarnAt'))) continue;
        const d = await done(u.id);
        const left = Math.max(1, Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / D));
        await send(u, `⏳ <b>Через ${left} ${left === 1 ? 'день' : 'дня'} закончится пробный период.</b>\n${d ? `За это время: ${d}. ` : ''}${FREE_LINE}\n\n${OFFER_LINE}`, `Выбрать тариф`);
      }
      // 2. пробный закончился (последние 3 дня)
      for (const u of await prisma.user.findMany({ where: { trialEndAt: null, trialEndsAt: { lte: now, gt: new Date(now.getTime() - 3 * D) }, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await claim(u.id, 'trialEndAt'))) continue;
        const d = await done(u.id);
        // бонус за Instagram ещё не брали — сначала предлагаем его: +12 дней бесплатно
        if (!(await bonusDone(u.id))) {
          const url = await igUrl();
          await sendTo(u, `🔓 <b>Пробный день закончился.</b>${d ? `\nВы успели: ${d}. Всё сохранено.` : ''}\n\n${bonusHowTo(await bonusCode(u.id), await igUsername(), url)}`,
            { link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: '📸 Открыть Instagram', url }]] } });
          continue;
        }
        await send(u, `🔓 <b>Пробный период закончился.</b>\n${d ? `Вы успели: ${d}. Всё сохранено. ` : ''}${FREE_LINE}\n\n${OFFER_LINE}`, `Лайт за ${PRICES.liteFirst} ₽ / Про за ${PRICES.proFirst} ₽`);
      }
      // 3. напоминание через 5 дней после окончания пробного
      for (const u of await prisma.user.findMany({ where: { firstRemindAt: null, trialEndAt: { lte: new Date(now.getTime() - 5 * D), gt: new Date(now.getTime() - 60 * D) }, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await claim(u.id, 'firstRemindAt'))) continue;
        await send(u, `👷 Скидка на первый месяц всё ещё ваша: <b>«Лайт» — ${PRICES.liteFirst} ₽</b>, <b>«Про» — ${PRICES.proFirst} ₽</b>.\n«Лайт» — это ≈ 3 ₽ в день, дешевле пачки саморезов: все сметы без пометки и с вашим логотипом. «Про» окупается одним договором. Без автосписаний.`, 'Выбрать тариф');
      }
      // L. так и не оплатил: через 16 дней после пробного — скидка на 72 часа
      for (const u of await prisma.user.findMany({ where: { trialEndAt: { lte: new Date(now.getTime() - 16 * D), gt: new Date(now.getTime() - 40 * D) }, offerPct: null, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await once(`fn:late:${u.id}`))) continue;
        const pct = 65, until = new Date(now.getTime() + PRICES.winbackHours * H);
        await prisma.user.update({ where: { id: u.id }, data: { offerPct: pct, offerUntil: until } });
        const lite = Math.round(PRICES.lite * (1 - pct / 100)), pro = Math.round(PRICES.pro * (1 - pct / 100));
        await send(u, `🎁 <b>Только 72 часа: −${pct}% на первый месяц.</b>\n«Лайт» — <b>${lite} ₽</b> вместо ${PRICES.lite} ₽, «Про» — <b>${pro} ₽</b> вместо ${PRICES.pro} ₽.\nДействует до ${until.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`, `Забрать скидку`);
      }
      // 4. две оплаты помесячно — предложить год
      for (const u of await prisma.user.findMany({ where: { yearNudgeAt: null, plan: { in: ['pro', 'lite'] }, subscriptionUntil: { gt: now } }, take: 100 })) {
        if (isAdmin(u)) continue;
        const t = u.plan === 'lite' ? 'lite' : 'pro';
        const months = await prisma.payment.count({ where: { userId: u.id, planCode: `${t}_m`, status: 'paid' } });
        const years = await prisma.payment.count({ where: { userId: u.id, planCode: `${t}_y`, status: 'paid' } });
        if (months < 2 || years > 0 || !(await claim(u.id, 'yearNudgeAt'))) continue;
        const m = t === 'lite' ? PRICES.lite : PRICES.pro, y = t === 'lite' ? PRICES.liteYear : PRICES.proYear;
        await send(u, `🙌 Вы с СМЕТА PRO уже ${months} месяца — спасибо!\nПереходите на год: <b>${rub(y)}</b> вместо ${rub(m * 12)} — экономия ${rub(m * 12 - y)}. Оставшиеся дни текущей подписки сохранятся.`, 'Перейти на год');
      }
      // 5. возврат: подписка закончилась 30–45 дней назад
      for (const u of await prisma.user.findMany({ where: { winbackAt: null, subscriptionUntil: { lte: new Date(now.getTime() - 30 * D), gt: new Date(now.getTime() - 45 * D) } }, take: 50 })) {
        if (isAdmin(u) || !(await claim(u.id, 'winbackAt'))) continue;
        const until = new Date(now.getTime() + PRICES.winbackHours * H);
        await prisma.user.update({ where: { id: u.id }, data: { offerPct: PRICES.winbackPct, offerUntil: until } });
        const d = await done(u.id);
        const base = u.plan === 'lite' ? PRICES.lite : PRICES.pro;
        const price = Math.round(base * (1 - PRICES.winbackPct / 100));
        await send(u, `👋 <b>Скучаем!</b>\n${d ? `Ваши ${d} сохранены. ` : ''}Только для вас — месяц «${u.plan === 'lite' ? 'Лайт' : 'Про'}» за <b>${price} ₽</b> вместо ${base} ₽.\nПредложение действует ${PRICES.winbackHours} часа — до ${until.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`, `Вернуться за ${price} ₽`);
      }
    } catch (e) { log.error({ err: e }, 'funnel'); }
  };
  setInterval(tick, 10 * 60e3);
  setTimeout(tick, 60e3);
  log.info('Воронка оплаты запущена');
}
