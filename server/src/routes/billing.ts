import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma, plain, HttpError, audit } from '../util';
import { env } from '../env';
import { TIERS, PRICES, convertDays, teamMonthRub, TEAM_BASE_RUB, teamSeatHolders, seatsOf, monthKey, type Tier } from '../../../shared/plans';
import { priceFor } from './promo';

/**
 * Тарифы: Про / Бригада на 3, 5 или 10 человек (месяц и год −30%) и разовый эскизный проект 3D.
 * «Лайт» и «10 смет» больше не продаются (старые оплаты и подписки сохраняются).
 * Оплата цифровых услуг внутри Telegram — Telegram Stars; картой и СБП — через ЮKassa.
 * 1 звезда ≈ 2,46 ₽ для пользователя, звёзды округлены (выплата Telegram за звезду меньше — выгоднее ЮKassa).
 * Цены синхронизируются с базой при каждом запуске; старые тарифы отключаются (оплаты по ним сохраняются).
 */
export const STAR_RUB = 2.46;
export const toStars = (rub: number) => Math.max(1, Math.round(rub / STAR_RUB));
const P = (code: string, title: string, tier: string, months: number, rubPrice: number, sort: number, extra: { aiLimit?: number; seats?: number; designs?: number; estimates?: number } = {}) =>
  ({ code, title, tier, months, rubPrice, starsPrice: toStars(rubPrice), aiLimit: extra.aiLimit ?? 0, sort, active: true, estimates: extra.estimates ?? 0, designs: extra.designs ?? 0, seats: extra.seats ?? 0 });
const year = (m: number) => Math.round((m * 12 * 0.7) / 10) * 10; // год — −30%
export const DEFAULT_PLANS = [
  P('pro_m', 'Про на 1 месяц', 'pro', 1, PRICES.pro, 3, { aiLimit: 300 }),
  P('pro_y', 'Про на 12 месяцев (−30%)', 'pro', 12, PRICES.proYear, 4, { aiLimit: 300 }),
  ...[3, 5, 10].flatMap((n, i) => [
    P(n === 3 ? 'team_m' : `team${n}_m`, `Бригада до ${n} чел. на 1 месяц`, 'team', 1, teamMonthRub(n), 5 + i * 2, { aiLimit: 1000, seats: n }),
    P(n === 3 ? 'team_y' : `team${n}_y`, `Бригада до ${n} чел. на 12 месяцев (−30%)`, 'team', 12, year(teamMonthRub(n)), 6 + i * 2, { aiLimit: 1000, seats: n }),
  ]),
  P('est1', 'Одна смета без пометки', 'pack', 0, PRICES.estimate, 18, { estimates: 1 }),
  P('est10', `10 смет на ${PRICES.packMonths} месяцев`, 'pack', 0, PRICES.pack10, 19, { estimates: 10 }),
  P('design1', '3D-проект для заказчика', 'pack', 0, PRICES.design, 20, { designs: 1 }),
  P('studio_m', '3D-Студия на 1 месяц', 'studio', 1, PRICES.studio, 21),
];
/** Разовые покупки и «3D-Студия» — не подписка «Про»/«Бригада» (для первой скидки и промокодов) */
export const NOT_SUB = ['est1', 'est10', 'design1', 'studio_m'];
/** Цена месяца уровня — для пересчёта остатка при смене тарифа (Бригада — по числу мест) */
export const TIER_MONTH_RUB: Record<string, number> = { lite: 390, pro: PRICES.pro, team: TEAM_BASE_RUB };
const monthRub = (tier: string, seats?: number | null) => (tier === 'team' ? teamMonthRub(seats && seats > 0 ? seats : 5) : TIER_MONTH_RUB[tier] || PRICES.pro);

export async function seedPlans() {
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: p, update: p });
  }
  await prisma.plan.updateMany({ where: { code: { notIn: DEFAULT_PLANS.map((p) => p.code) } }, data: { active: false } });
}

/** Доступ участников бригады идёт за подпиской владельца — и только в пределах оплаченных мест:
 *  места получают первые вступившие, остальные остаются в бригаде без доступа, пока бригадир не доплатит. */
export async function syncTeam(ownerId: string) {
  const o = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!o) return;
  const teamActive = o.plan === 'team' && o.subscriptionUntil && o.subscriptionUntil > new Date();
  const members = await prisma.user.findMany({ where: { teamOwnerId: ownerId }, select: { id: true, teamJoinedAt: true, createdAt: true } });
  const holders = teamSeatHolders(members.map((m) => ({ id: m.id, joined: (m.teamJoinedAt || m.createdAt).getTime() })), seatsOf(o as any));
  const on = members.filter((m) => holders.has(m.id)).map((m) => m.id), off = members.filter((m) => !holders.has(m.id)).map((m) => m.id);
  if (on.length) await prisma.user.updateMany({ where: { id: { in: on } }, data: { teamUntil: teamActive ? o.subscriptionUntil : null } });
  if (off.length) await prisma.user.updateMany({ where: { id: { in: off } }, data: { teamUntil: null } });
}

/** Начисление после ПОДТВЕРЖДЁННОЙ оплаты (Stars — successful_payment, ЮKassa — проверка через API).
 *  Подписка: продление; при смене уровня остаток пересчитывается по цене (дни × старая цена / новая).
 *  Пакет: добавляет сметы или эскизные проекты. Возвращает текст для пользователя; повтор — undefined. */
export async function applyPayment(userId: string, planCode: string, stars: number, chargeId: string, extra: { provider?: string; amountRub?: number; target?: string | null } = {}): Promise<{ text: string; referrer?: { tgId: bigint; until: Date } } | void> {
  const exists = await prisma.payment.findUnique({ where: { telegramChargeId: chargeId } });
  if (exists) return; // идемпотентность: повторное уведомление не продлевает дважды
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error(`Неизвестный тариф ${planCode}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // промокод: скидка была, если это первая оплата подписки (до создания платежа)
  const disc = await priceFor(user, plan);
  const pay = prisma.payment.create({ data: { userId, planCode, stars, telegramChargeId: chargeId, provider: extra.provider || 'stars', amountRub: extra.amountRub ?? null, promoCode: user.promoCode, discountPct: disc?.discountPct || null } });
  const now = new Date();
  const target = extra.target && /^[\w-]{5,64}$/.test(extra.target) ? extra.target : null;
  if (plan.months === 0) {
    // смета или 3D-проект для конкретного объекта — отмечаем его оплаченным; без цели — кредит на будущее
    if (plan.code === 'est1' && target) {
      const e = await prisma.estimate.findFirst({ where: { id: target, userId }, select: { id: true, title: true } });
      if (e) {
        await prisma.$transaction([pay, prisma.estimate.update({ where: { id: e.id }, data: { paidAt: now } })]);
        return { text: `Оплата прошла. Смета «${e.title}» — без пометки «Сделано в СМЕТА PRO», с вашим логотипом. Её можно править и отправлять сколько угодно.` + (await overspendHint(userId)) };
      }
    }
    if (plan.code === 'design1' && target) {
      const d = await prisma.design.findFirst({ where: { id: target, userId }, select: { id: true, title: true } });
      if (d) {
        await prisma.$transaction([pay, prisma.design.update({ where: { id: d.id }, data: { paidAt: now } })]);
        return { text: `Оплата прошла. 3D-проект «${d.title}» готов для заказчика: PDF без водяного знака и 3D-ссылка — сколько угодно раз.\n💡 Включите проект в смету заказчику отдельной строкой — обычно это 3–5 тыс. ₽.` + (await overspendHint(userId)) };
      }
    }
    const half = new Date(now); half.setMonth(half.getMonth() + PRICES.packMonths);
    const until = new Date(Math.max(half.getTime(), user.extraUntil?.getTime() || 0)); // сметы действуют полгода от последней покупки
    await prisma.$transaction([pay, prisma.user.update({ where: { id: userId }, data: { extraEstimates: { increment: plan.estimates }, extraDesigns: { increment: plan.designs }, ...(plan.estimates ? { extraUntil: until } : {}) } })]);
    return { text: (plan.estimates ? `Оплата прошла: добавлено смет — ${plan.estimates}, действуют до ${until.toLocaleDateString('ru-RU')}.` : `Оплата прошла: добавлен 3D-проект для заказчика. Отправьте PDF или 3D-ссылку из проектировщика.`) + (await overspendHint(userId)) };
  }
  if (plan.tier === 'studio') {
    const base = user.studioUntil && user.studioUntil > now ? new Date(user.studioUntil) : new Date(now);
    base.setMonth(base.getMonth() + plan.months);
    await prisma.$transaction([pay, prisma.user.update({ where: { id: userId }, data: { studioUntil: base } })]);
    return { text: `Оплата прошла. «3D-Студия» активна до ${base.toLocaleDateString('ru-RU')}: 3D-проекты без водяного знака и 3D-ссылки для заказчиков — без ограничений.` };
  }
  const active = user.subscriptionUntil && user.subscriptionUntil > now;
  const oldTier = user.plan || 'pro';
  let base = active ? new Date(user.subscriptionUntil!) : now;
  const oldSeats = (user as any).teamSeats || 0;
  const newSeats = plan.tier === 'team' ? (plan as any).seats || 3 : 0;
  if (active && (oldTier !== plan.tier || (plan.tier === 'team' && (oldSeats || 5) !== newSeats))) {
    // смена уровня или размера бригады: остаток дней пересчитываем по цене месяца
    const left = (user.subscriptionUntil!.getTime() - now.getTime()) / 864e5;
    base = new Date(now.getTime() + convertDays(left, monthRub(oldTier, oldSeats), monthRub(plan.tier, newSeats)) * 864e5);
  }
  const until = new Date(base);
  until.setMonth(until.getMonth() + plan.months);
  await prisma.$transaction([
    pay,
    prisma.user.update({ where: { id: userId }, data: { subscriptionUntil: until, plan: plan.tier, ...(plan.tier === 'team' ? { teamSeats: newSeats } : {}), subNotice3At: null, subNoticeEndAt: null, offerPct: null, offerUntil: null, winbackAt: null } }),
  ]);
  await syncTeam(userId);
  const label = TIERS[plan.tier as Tier]?.label || 'Подписка';
  return { text: `Оплата прошла. Тариф «${label}»${plan.tier === 'team' ? ` (до ${newSeats} чел.)` : ''} активен до ${until.toLocaleDateString('ru-RU')}.`, referrer: (await rewardReferrer(user)) ?? undefined };
}

/** Подсказка после разовой покупки: если за месяц на разовые ушло не меньше цены «Про» */
async function overspendHint(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { subscriptionUntil: true } });
  if (u?.subscriptionUntil && u.subscriptionUntil > new Date()) return '';
  const since = new Date(`${monthKey()}-01T00:00:00+03:00`);
  const pays = await prisma.payment.findMany({ where: { userId, createdAt: { gte: since }, planCode: { in: ['est1', 'est10', 'design1'] }, status: 'paid' }, select: { amountRub: true, stars: true } });
  const spent = pays.reduce((a, p) => a + (p.amountRub || Math.round(p.stars * STAR_RUB)), 0);
  if (spent < PRICES.pro) return '';
  const first = (await prisma.payment.count({ where: { userId, planCode: { notIn: NOT_SUB } } })) === 0;
  return `\n\n💡 В этом месяце вы потратили на разовые покупки ${spent} ₽. «Про» стоит ${PRICES.pro} ₽ в месяц${first ? ` (первый месяц — ${PRICES.proFirst} ₽)` : ''}: сметы без ограничений и 3D-проекты дешевле.`;
}

/** «Приведи друга»: за первую оплату приглашённого пригласившему +1 месяц (один раз на друга) */
export async function rewardReferrer(friend: { id: string; referredById: string | null }) {
  if (!friend.referredById || friend.referredById === friend.id) return null;
  const claimed = await prisma.user.updateMany({ where: { id: friend.id, referralRewardedAt: null }, data: { referralRewardedAt: new Date() } });
  if (!claimed.count) return null;
  const ref = await prisma.user.findUnique({ where: { id: friend.referredById } });
  if (!ref) return null;
  const base = ref.subscriptionUntil && ref.subscriptionUntil > new Date() ? ref.subscriptionUntil : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + 1);
  await prisma.user.update({ where: { id: ref.id }, data: { subscriptionUntil: until, subNotice3At: null, subNoticeEndAt: null } });
  return { tgId: ref.tgId, until };
}

export async function billingRoutes(app: FastifyInstance, opts: { bot?: any }) {
  app.get('/api/plans', async (req) => {
    const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' } });
    // цена для этого пользователя: со скидкой по промокоду на первую оплату подписки
    return plain(await Promise.all(plans.map(async (p) => ({ ...p, price: await priceFor(req.user, p) }))));
  });

  app.get('/api/payments', async (req) => plain(await prisma.payment.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })));

  // Создать ссылку на оплату в Telegram Stars. Доступ выдаётся только после successful_payment.
  app.post('/api/pay/:code', async (req) => {
    const { code } = req.params as any;
    const { target } = z.object({ target: z.string().regex(/^[\w-]{5,64}$/).optional() }).parse(req.body || {});
    const plan = await prisma.plan.findFirst({ where: { code, active: true } });
    if (!plan) throw new HttpError(404, 'Тариф не найден');
    if (!opts.bot) throw new HttpError(503, 'Оплата не настроена: бот не подключён', 'payments_unavailable');
    const price = await priceFor(req.user, plan);
    const url = await opts.bot.api.createInvoiceLink(
      plan.title, plan.months ? `СМЕТА PRO, тариф «${TIERS[plan.tier as Tier]?.label || ''}»: ${(TIERS[plan.tier as Tier]?.perks || []).slice(0, 3).join(', ')}`.slice(0, 255) : 'СМЕТА PRO: разовая покупка без подписки',
      `${req.user.id}:${plan.code}${target ? `:${target}` : ''}`, '', 'XTR', [{ label: plan.title + (price.discountPct ? ` (−${price.discountPct}%)` : ''), amount: price.stars }],
    );
    await audit(req.user.id, 'checkout', plan.code, 'start', { provider: 'stars', stars: price.stars });
    return { url };
  });

  // ---- ЮKassa: карта, СБП, SberPay. Подписка продлевается только после подтверждённой оплаты ----
  const ykAuth = () => 'Basic ' + Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
  const ykEnabled = () => Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);

  app.post('/api/pay/:code/yookassa', async (req) => {
    if (!ykEnabled()) throw new HttpError(503, 'Оплата картой ещё не подключена', 'payments_unavailable');
    const { code } = req.params as any;
    const { email, target } = z.object({ email: z.string().email().max(120).optional(), target: z.string().regex(/^[\w-]{5,64}$/).optional() }).parse(req.body || {});
    const plan = await prisma.plan.findFirst({ where: { code, active: true } });
    if (!plan || !plan.rubPrice) throw new HttpError(404, 'Тариф не найден');
    if (env.YOOKASSA_RECEIPT && !email) throw new HttpError(400, 'Укажите email — на него придёт чек', 'email_required');
    const price = await priceFor(req.user, plan);
    const value = `${price.rub}.00`;
    const body: any = {
      amount: { value, currency: 'RUB' }, capture: true,
      confirmation: { type: 'redirect', return_url: `${env.PUBLIC_URL || ''}/paid` },
      description: `${plan.title} — СМЕТА PRO`.slice(0, 128),
      metadata: { userId: req.user.id, plan: plan.code, ...(target ? { target } : {}), ...(price.promo ? { promo: price.promo } : {}) },
    };
    if (env.YOOKASSA_RECEIPT) body.receipt = { customer: { email }, items: [{ description: plan.title.slice(0, 128), quantity: '1.00', amount: { value, currency: 'RUB' }, vat_code: env.YOOKASSA_VAT_CODE, payment_mode: 'full_payment', payment_subject: 'service' }] };
    const r = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST', headers: { Authorization: ykAuth(), 'Idempotence-Key': crypto.randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.confirmation?.confirmation_url) { req.log.error({ yk: j }, 'yookassa create failed'); throw new HttpError(502, 'ЮKassa не приняла платёж: ' + (j.description || r.status)); }
    await audit(req.user.id, 'checkout', plan.code, 'start', { provider: 'yookassa', rub: price.rub });
    return { url: j.confirmation.confirmation_url, id: j.id };
  });

  /** Проверить платёж в ЮKassa и, если оплачен, продлить подписку (идемпотентно) */
  async function settleYk(id: string) {
    if (!/^[\w-]{10,64}$/.test(id)) return null;
    const r = await fetch(`https://api.yookassa.ru/v3/payments/${id}`, { headers: { Authorization: ykAuth() } });
    if (!r.ok) return null;
    const p: any = await r.json();
    if (p.status !== 'succeeded' || !p.paid || !p.metadata?.userId || !p.metadata?.plan) return { status: p.status };
    const user = await prisma.user.findUnique({ where: { id: p.metadata.userId } });
    if (!user) return { status: 'unknown_user' };
    const res = await applyPayment(user.id, p.metadata.plan, 0, `yk:${p.id}`, { provider: 'yookassa', amountRub: Math.round(Number(p.amount?.value || 0)), target: p.metadata.target || null });
    if (res && opts.bot) {
      await opts.bot.api.sendMessage(Number(user.tgId), res.text).catch(() => {});
      if (res && res.referrer) await opts.bot.api.sendMessage(Number(res.referrer.tgId), `🎁 Ваш друг оформил подписку СМЕТА PRO — дарим вам месяц бесплатно!\nПодписка продлена до ${res.referrer.until.toLocaleDateString('ru-RU')}.`).catch(() => {});
    }
    return { status: 'succeeded' };
  }

  // Уведомление от ЮKassa. Телу не доверяем: статус перепроверяем запросом к API ЮKassa с нашим ключом.
  app.post('/pay/yookassa/webhook', async (req, reply) => {
    if (!ykEnabled()) return reply.status(200).send({ ok: true });
    const id = (req.body as any)?.object?.id;
    if (typeof id === 'string') await settleYk(id).catch((e) => req.log.error(e, 'yookassa settle failed'));
    return reply.status(200).send({ ok: true });
  });

  // Проверка из приложения (если уведомление задержалось)
  app.post('/api/pay/yookassa/:id/check', async (req) => {
    if (!ykEnabled()) throw new HttpError(503, 'Оплата картой не подключена');
    const r = await settleYk((req.params as any).id);
    return r || { status: 'unknown' };
  });

  // Страница возврата после оплаты (открывается в браузере)
  app.get('/paid', async (_req, reply) => reply.header('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оплата</title><body style="font:17px system-ui;padding:28px;background:#f4f1ea;color:#22180f"><h1>Спасибо!</h1><p>Если оплата прошла, подписка продлится в течение минуты — бот пришлёт сообщение. Вернитесь в Telegram.</p></body>`));
}
