/**
 * Воронка оплаты: сообщения бота в нужный момент (каждое — один раз на человека, только днём по Москве).
 * 1. Пробный «Про» закончится завтра — что успели сделать.
 * 2. Пробный закончился — первый месяц «Про» за PRICES.proFirst ₽.
 * 3. Через 5 дней — напоминание о первом месяце.
 * 4. Две оплаты помесячно — предложение перейти на год.
 * 5. Через 30 дней после окончания подписки — персональная скидка на 72 часа.
 */
import { prisma } from './util';
import { env } from './env';
import { PRICES } from '../../shared/plans';
import { estimateTotals } from './routes/estimates';
import { NOT_SUB } from './routes/billing';

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

  const tick = async () => {
    const now = new Date();
    const mskHour = new Date(now.getTime() + 3 * H).getUTCHours();
    if (mskHour < 10 || mskHour >= 21) return; // не будим людей
    try {
      const noSub = { OR: [{ subscriptionUntil: null }, { subscriptionUntil: { lte: now } }] };
      // 1. пробный закончится в ближайшие сутки
      for (const u of await prisma.user.findMany({ where: { trialWarnAt: null, trialEndsAt: { gt: now, lte: new Date(now.getTime() + D) }, createdAt: { lte: new Date(now.getTime() - 12 * H) }, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await claim(u.id, 'trialWarnAt'))) continue;
        const d = await done(u.id);
        await send(u, `⏳ <b>Завтра закончится пробный «Про».</b>\n${d ? `За эти дни: ${d}. ` : ''}Дальше — 3 сметы в месяц бесплатно, с пометкой «Сделано в СМЕТА PRO».\n\n«Про» — ${PRICES.pro} ₽ в месяц, а <b>первый месяц — всего ${PRICES.proFirst} ₽</b>: сметы без ограничений, ваш логотип, договор и акты.`, `Первый месяц за ${PRICES.proFirst} ₽`);
      }
      // 2. пробный закончился (последние 3 дня)
      for (const u of await prisma.user.findMany({ where: { trialEndAt: null, trialEndsAt: { lte: now, gt: new Date(now.getTime() - 3 * D) }, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await claim(u.id, 'trialEndAt'))) continue;
        const d = await done(u.id);
        await send(u, `🔓 <b>Пробный «Про» закончился.</b>\n${d ? `Вы успели: ${d}. Всё сохранено. ` : ''}Бесплатно остаются 3 сметы в месяц.\n\n🎁 Для вас <b>первый месяц «Про» — ${PRICES.proFirst} ₽</b> вместо ${PRICES.pro} ₽. Или разово: смета без пометки — ${PRICES.estimate} ₽, 10 смет на полгода — ${PRICES.pack10} ₽.`, `Первый месяц за ${PRICES.proFirst} ₽`);
      }
      // 3. напоминание через 5 дней после окончания пробного
      for (const u of await prisma.user.findMany({ where: { firstRemindAt: null, trialEndAt: { lte: new Date(now.getTime() - 5 * D), gt: new Date(now.getTime() - 60 * D) }, ...noSub }, take: 50 })) {
        if (isAdmin(u) || (await hadSub(u.id)) || !(await claim(u.id, 'firstRemindAt'))) continue;
        await send(u, `👷 Первый месяц «Про» за <b>${PRICES.proFirst} ₽</b> всё ещё ваш.\nЭто меньше 7 ₽ в день — дешевле пачки саморезов. Сметы без ограничений, PDF с вашим логотипом, договор, акты и учёт денег по объектам.`, 'Оформить за ' + PRICES.proFirst + ' ₽');
      }
      // 4. две оплаты помесячно — предложить год
      for (const u of await prisma.user.findMany({ where: { yearNudgeAt: null, plan: 'pro', subscriptionUntil: { gt: now } }, take: 100 })) {
        if (isAdmin(u)) continue;
        const months = await prisma.payment.count({ where: { userId: u.id, planCode: 'pro_m', status: 'paid' } });
        const years = await prisma.payment.count({ where: { userId: u.id, planCode: 'pro_y', status: 'paid' } });
        if (months < 2 || years > 0 || !(await claim(u.id, 'yearNudgeAt'))) continue;
        const save = PRICES.pro * 12 - PRICES.proYear;
        await send(u, `🙌 Вы с СМЕТА PRO уже ${months} месяца — спасибо!\nПереходите на год: <b>${rub(PRICES.proYear)}</b> вместо ${rub(PRICES.pro * 12)} — экономия ${rub(save)}. Оставшиеся дни текущей подписки сохранятся.`, 'Перейти на год');
      }
      // 5. возврат: подписка закончилась 30–45 дней назад
      for (const u of await prisma.user.findMany({ where: { winbackAt: null, subscriptionUntil: { lte: new Date(now.getTime() - 30 * D), gt: new Date(now.getTime() - 45 * D) } }, take: 50 })) {
        if (isAdmin(u) || !(await claim(u.id, 'winbackAt'))) continue;
        const until = new Date(now.getTime() + PRICES.winbackHours * H);
        await prisma.user.update({ where: { id: u.id }, data: { offerPct: PRICES.winbackPct, offerUntil: until } });
        const d = await done(u.id);
        const price = Math.round(PRICES.pro * (1 - PRICES.winbackPct / 100));
        await send(u, `👋 <b>Скучаем!</b>\n${d ? `Ваши ${d} сохранены. ` : ''}Только для вас — месяц «Про» за <b>${price} ₽</b> вместо ${PRICES.pro} ₽.\nПредложение действует ${PRICES.winbackHours} часа — до ${until.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`, `Вернуться за ${price} ₽`);
      }
    } catch (e) { log.error({ err: e }, 'funnel'); }
  };
  setInterval(tick, 10 * 60e3);
  setTimeout(tick, 60e3);
  log.info('Воронка оплаты запущена');
}
