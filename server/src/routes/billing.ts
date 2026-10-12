import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma, plain, HttpError } from '../util';
import { env } from '../env';
import { TIERS, convertDays, type Tier } from '../../../shared/plans';
import { priceFor } from './promo';

/**
 * Тарифы: Лайт / Про / Бригада (месяц и год −30%) и разовые пакеты без подписки.
 * Оплата цифровых услуг внутри Telegram — Telegram Stars; картой и СБП — через ЮKassa.
 * 1 звезда ≈ 2,46 ₽ для пользователя, звёзды округлены.
 * Цены синхронизируются с базой при каждом запуске; старые тарифы отключаются (оплаты по ним сохраняются).
 */
export const DEFAULT_PLANS = [
  { code: 'lite_m', title: 'Лайт на 1 месяц', tier: 'lite', months: 1, starsPrice: 159, rubPrice: 390, aiLimit: 0, sort: 1, active: true, estimates: 0, designs: 0 },
  { code: 'lite_y', title: 'Лайт на 12 месяцев (−30%)', tier: 'lite', months: 12, starsPrice: 1336, rubPrice: 3276, aiLimit: 0, sort: 2, active: true, estimates: 0, designs: 0 },
  { code: 'pro_m', title: 'Про на 1 месяц', tier: 'pro', months: 1, starsPrice: 319, rubPrice: 790, aiLimit: 300, sort: 3, active: true, estimates: 0, designs: 0 },
  { code: 'pro_y', title: 'Про на 12 месяцев (−30%)', tier: 'pro', months: 12, starsPrice: 2680, rubPrice: 6636, aiLimit: 300, sort: 4, active: true, estimates: 0, designs: 0 },
  { code: 'team_m', title: 'Бригада на 1 месяц', tier: 'team', months: 1, starsPrice: 689, rubPrice: 1690, aiLimit: 1000, sort: 5, active: true, estimates: 0, designs: 0 },
  { code: 'team_y', title: 'Бригада на 12 месяцев (−30%)', tier: 'team', months: 12, starsPrice: 5788, rubPrice: 14196, aiLimit: 1000, sort: 6, active: true, estimates: 0, designs: 0 },
  { code: 'est10', title: '10 смет без подписки', tier: 'pack', months: 0, starsPrice: 119, rubPrice: 290, aiLimit: 0, sort: 10, active: true, estimates: 10, designs: 0 },
  { code: 'design1', title: 'Эскизный проект 3D (1 PDF)', tier: 'pack', months: 0, starsPrice: 61, rubPrice: 149, aiLimit: 0, sort: 11, active: true, estimates: 0, designs: 1 },
];
/** Цена месяца уровня — для пересчёта остатка при смене тарифа */
export const TIER_MONTH_RUB: Record<string, number> = { lite: 390, pro: 790, team: 1690 };

export async function seedPlans() {
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: p, update: p });
  }
  await prisma.plan.updateMany({ where: { code: { notIn: DEFAULT_PLANS.map((p) => p.code) } }, data: { active: false } });
}

/** Доступ участников бригады идёт за подпиской владельца */
export async function syncTeam(ownerId: string) {
  const o = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!o) return;
  const teamActive = o.plan === 'team' && o.subscriptionUntil && o.subscriptionUntil > new Date();
  await prisma.user.updateMany({ where: { teamOwnerId: ownerId }, data: { teamUntil: teamActive ? o.subscriptionUntil : null } });
}

/** Начисление после ПОДТВЕРЖДЁННОЙ оплаты (Stars — successful_payment, ЮKassa — проверка через API).
 *  Подписка: продление; при смене уровня остаток пересчитывается по цене (дни × старая цена / новая).
 *  Пакет: добавляет сметы или эскизные проекты. Возвращает текст для пользователя; повтор — undefined. */
export async function applyPayment(userId: string, planCode: string, stars: number, chargeId: string, extra: { provider?: string; amountRub?: number } = {}): Promise<{ text: string; referrer?: { tgId: bigint; until: Date } } | void> {
  const exists = await prisma.payment.findUnique({ where: { telegramChargeId: chargeId } });
  if (exists) return; // идемпотентность: повторное уведомление не продлевает дважды
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error(`Неизвестный тариф ${planCode}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // промокод: скидка была, если это первая оплата подписки (до создания платежа)
  const disc = user.promoCode ? await priceFor(user, plan) : null;
  const pay = prisma.payment.create({ data: { userId, planCode, stars, telegramChargeId: chargeId, provider: extra.provider || 'stars', amountRub: extra.amountRub ?? null, promoCode: user.promoCode, discountPct: disc?.discountPct || null } });
  if (plan.months === 0) {
    await prisma.$transaction([pay, prisma.user.update({ where: { id: userId }, data: { extraEstimates: { increment: plan.estimates }, extraDesigns: { increment: plan.designs } } })]);
    return { text: plan.estimates ? `Оплата прошла: добавлено смет — ${plan.estimates}.` : `Оплата прошла: добавлен эскизный проект 3D (${plan.designs} PDF).` };
  }
  const now = new Date();
  const active = user.subscriptionUntil && user.subscriptionUntil > now;
  const oldTier = user.plan || 'pro';
  let base = active ? new Date(user.subscriptionUntil!) : now;
  if (active && oldTier !== plan.tier) {
    const left = (user.subscriptionUntil!.getTime() - now.getTime()) / 864e5;
    base = new Date(now.getTime() + convertDays(left, TIER_MONTH_RUB[oldTier] || 490, TIER_MONTH_RUB[plan.tier] || 790) * 864e5);
  }
  const until = new Date(base);
  until.setMonth(until.getMonth() + plan.months);
  await prisma.$transaction([
    pay,
    prisma.user.update({ where: { id: userId }, data: { subscriptionUntil: until, plan: plan.tier, subNotice3At: null, subNoticeEndAt: null } }),
  ]);
  await syncTeam(userId);
  const label = TIERS[plan.tier as Tier]?.label || 'Подписка';
  return { text: `Оплата прошла. Тариф «${label}» активен до ${until.toLocaleDateString('ru-RU')}.`, referrer: (await rewardReferrer(user)) ?? undefined };
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
    const plan = await prisma.plan.findFirst({ where: { code, active: true } });
    if (!plan) throw new HttpError(404, 'Тариф не найден');
    if (!opts.bot) throw new HttpError(503, 'Оплата не настроена: бот не подключён', 'payments_unavailable');
    const price = await priceFor(req.user, plan);
    const url = await opts.bot.api.createInvoiceLink(
      plan.title, plan.months ? `СМЕТА PRO, тариф «${TIERS[plan.tier as Tier]?.label || ''}»: ${(TIERS[plan.tier as Tier]?.perks || []).slice(0, 3).join(', ')}`.slice(0, 255) : 'СМЕТА PRO: разовая покупка без подписки',
      `${req.user.id}:${plan.code}`, '', 'XTR', [{ label: plan.title + (price.discountPct ? ` (−${price.discountPct}%)` : ''), amount: price.stars }],
    );
    return { url };
  });

  // ---- ЮKassa: карта, СБП, SberPay. Подписка продлевается только после подтверждённой оплаты ----
  const ykAuth = () => 'Basic ' + Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
  const ykEnabled = () => Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);

  app.post('/api/pay/:code/yookassa', async (req) => {
    if (!ykEnabled()) throw new HttpError(503, 'Оплата картой ещё не подключена', 'payments_unavailable');
    const { code } = req.params as any;
    const { email } = z.object({ email: z.string().email().max(120).optional() }).parse(req.body || {});
    const plan = await prisma.plan.findFirst({ where: { code, active: true } });
    if (!plan || !plan.rubPrice) throw new HttpError(404, 'Тариф не найден');
    if (env.YOOKASSA_RECEIPT && !email) throw new HttpError(400, 'Укажите email — на него придёт чек', 'email_required');
    const price = await priceFor(req.user, plan);
    const value = `${price.rub}.00`;
    const body: any = {
      amount: { value, currency: 'RUB' }, capture: true,
      confirmation: { type: 'redirect', return_url: `${env.PUBLIC_URL || ''}/paid` },
      description: `${plan.title} — СМЕТА PRO`.slice(0, 128),
      metadata: { userId: req.user.id, plan: plan.code, ...(price.promo ? { promo: price.promo } : {}) },
    };
    if (env.YOOKASSA_RECEIPT) body.receipt = { customer: { email }, items: [{ description: plan.title.slice(0, 128), quantity: '1.00', amount: { value, currency: 'RUB' }, vat_code: env.YOOKASSA_VAT_CODE, payment_mode: 'full_payment', payment_subject: 'service' }] };
    const r = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST', headers: { Authorization: ykAuth(), 'Idempotence-Key': crypto.randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.confirmation?.confirmation_url) { req.log.error({ yk: j }, 'yookassa create failed'); throw new HttpError(502, 'ЮKassa не приняла платёж: ' + (j.description || r.status)); }
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
    const res = await applyPayment(user.id, p.metadata.plan, 0, `yk:${p.id}`, { provider: 'yookassa', amountRub: Math.round(Number(p.amount?.value || 0)) });
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
