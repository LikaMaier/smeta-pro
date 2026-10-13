/**
 * Сводка для администратора: заходы, новые пользователи, сметы, проекты, оформления и оплаты.
 * Приходит в бот 3 раза в день (по Москве) и по команде /stats.
 */
import { prisma } from './util';
import { env } from './env';

const MSK = 3 * 3600e3;
/** «2026-10-13» — день по Москве */
export const mskDay = (d: Date) => new Date(d.getTime() + MSK).toISOString().slice(0, 10);
/** Полночь по Москве для даты */
const mskMidnight = (d: Date) => new Date(Date.parse(mskDay(d) + 'T00:00:00Z') - MSK);
const hhmm = (d: Date) => new Date(d.getTime() + MSK).toISOString().slice(11, 16);
const dm = (d: Date) => new Date(d.getTime() + MSK).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rub = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';

/** Часы отправки по Москве */
export const REPORT_HOURS = [9, 14, 20];

/** Получатели: ADMIN_TG_IDS, иначе — владелец */
export const reportTo = () => (env.ADMIN_TG_IDS.length ? env.ADMIN_TG_IDS : ['503303776']);

async function adminUserIds() {
  const ids = reportTo().filter((x) => /^\d+$/.test(x)).map((x) => BigInt(x));
  return (await prisma.user.findMany({ where: { tgId: { in: ids } }, select: { id: true } })).map((u) => u.id);
}

async function period(from: Date, to: Date, skip: string[]) {
  const notAdmin = { notIn: skip };
  const range = { gte: from, lt: to };
  const [newUsers, seen, estimates, designs, checkouts, payments] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: range, id: notAdmin }, select: { firstName: true, username: true, promoCode: true, referredById: true }, orderBy: { createdAt: 'asc' } }),
    prisma.userDay.findMany({ where: { lastAt: range, userId: notAdmin }, select: { userId: true, opens: true, firstAt: true } }),
    prisma.estimate.findMany({ where: { createdAt: range, userId: notAdmin, isTemplate: false }, select: { userId: true } }),
    prisma.design.count({ where: { createdAt: range, userId: notAdmin } }),
    prisma.auditLog.findMany({ where: { createdAt: range, entity: 'checkout', userId: notAdmin }, select: { userId: true, entityId: true } }),
    prisma.payment.findMany({ where: { createdAt: range, userId: notAdmin, status: 'paid' }, select: { planCode: true, amountRub: true, stars: true, provider: true, user: { select: { firstName: true, username: true } } } }),
  ]);
  return {
    newUsers,
    visitors: new Set(seen.map((s) => s.userId)).size,
    estimates: estimates.length,
    estimators: new Set(estimates.map((e) => e.userId)).size,
    designs,
    checkouts: checkouts.length,
    checkoutUsers: new Set(checkouts.map((c) => c.userId)).size,
    payments,
    rub: payments.reduce((a, p) => a + (p.amountRub || 0), 0),
    stars: payments.filter((p) => p.provider === 'stars').reduce((a, p) => a + p.stars, 0),
  };
}

const who = (u: { firstName: string | null; username: string | null }) => esc(u.firstName || 'без имени') + (u.username ? ` @${esc(u.username)}` : '');

export async function buildReport(from: Date, to: Date) {
  const skip = await adminUserIds();
  const [p, today, total, paidNow, trialNow] = await Promise.all([
    period(from, to, skip),
    period(mskMidnight(to), to, skip),
    prisma.user.count({ where: { id: { notIn: skip } } }),
    prisma.user.count({ where: { id: { notIn: skip }, subscriptionUntil: { gt: to } } }),
    prisma.user.count({ where: { id: { notIn: skip }, trialEndsAt: { gt: to }, OR: [{ subscriptionUntil: null }, { subscriptionUntil: { lte: to } }] } }),
  ]);
  const plans = new Map((await prisma.plan.findMany({ select: { code: true, title: true } })).map((x) => [x.code, x.title]));
  const L: string[] = [];
  L.push(`📊 <b>СМЕТА PRO — сводка ${hhmm(to)}</b>`);
  L.push(`<i>с ${dm(from) === dm(to) ? hhmm(from) : `${dm(from)} ${hhmm(from)}`} до ${hhmm(to)}</i>`, '');
  L.push(`👤 Новые пользователи: <b>${p.newUsers.length}</b>`);
  for (const u of p.newUsers.slice(0, 10)) L.push(`   • ${who(u)}${u.promoCode ? ` — промокод ${esc(u.promoCode)}` : u.referredById ? ' — по приглашению' : ''}`);
  if (p.newUsers.length > 10) L.push(`   … и ещё ${p.newUsers.length - 10}`);
  L.push(`📱 Заходили в приложение: <b>${p.visitors}</b> чел.`);
  L.push(`🧾 Создано смет: <b>${p.estimates}</b>${p.estimates ? ` (у ${p.estimators} чел.)` : ''}`);
  L.push(`🏗 3D-проектов: <b>${p.designs}</b>`);
  L.push(`🛒 Начали оформлять оплату: <b>${p.checkouts}</b>${p.checkouts ? ` (${p.checkoutUsers} чел.)` : ''}`);
  L.push(`💳 Оплат: <b>${p.payments.length}</b>${p.rub ? ` на <b>${rub(p.rub)}</b>` : ''}${p.stars ? ` + ${p.stars} ⭐` : ''}`);
  for (const x of p.payments.slice(0, 10)) L.push(`   • ${who(x.user)} — ${esc(plans.get(x.planCode) || x.planCode)}${x.amountRub ? `, ${rub(x.amountRub)}` : `, ${x.stars} ⭐`}`);
  L.push('', `<b>За сегодня:</b> новых ${today.newUsers.length} · заходили ${today.visitors} · смет ${today.estimates} · оплат ${today.payments.length}${today.rub ? ` (${rub(today.rub)})` : ''}`);
  L.push(`<b>Всего:</b> пользователей ${total} · платных подписок ${paidNow} · на пробном периоде ${trialNow}`);
  return L.join('\n');
}

/** Последний наступивший слот отправки (по Москве) */
function lastSlot(now: Date) {
  const base = mskMidnight(now).getTime();
  const slots: number[] = [];
  for (const dd of [-1, 0]) for (const h of REPORT_HOURS) slots.push(base + dd * 864e5 + h * 3600e3);
  return slots.filter((s) => s <= now.getTime()).sort((a, b) => b - a);
}

/** Раз в минуту: если наступил новый слот — отправить сводку за время с прошлого слота */
export function startAdminReports(bot: any, log: { error: (o: any, m?: string) => void; info: (m: string) => void }) {
  const KEY = 'adminReport:lastSlot';
  const tick = async () => {
    try {
      const now = new Date();
      const [cur, prev] = lastSlot(now);
      if (!cur || now.getTime() - cur > 3 * 3600e3) return; // сильно опоздали (сервер спал) — ждём следующий слот
      const last = await prisma.appKV.findUnique({ where: { key: KEY } });
      if (last && Number(last.value) >= cur) return;
      // захват слота, чтобы при двух копиях сервера сводка не ушла дважды
      if (last) {
        const r = await prisma.appKV.updateMany({ where: { key: KEY, value: last.value }, data: { value: String(cur) } });
        if (!r.count) return;
      } else {
        try { await prisma.appKV.create({ data: { key: KEY, value: String(cur) } }); } catch { return; }
      }
      const text = await buildReport(new Date(prev), now);
      for (const id of reportTo()) await bot.api.sendMessage(Number(id), text, { parse_mode: 'HTML' }).catch((e: any) => log.error({ err: e }, 'admin report send'));
    } catch (e) { log.error({ err: e }, 'admin report'); }
  };
  setInterval(tick, 60000);
  setTimeout(tick, 15000);
  log.info(`Сводка администратору: ${REPORT_HOURS.join(', ')}:00 МСК`);
}
