import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma, plain, HttpError } from '../util';
import { env } from '../env';

/**
 * Тарифы. Оплата цифровых услуг внутри Telegram — только в Telegram Stars.
 * 1 звезда стоит пользователю ≈ 2–3 ₽ (зависит от способа покупки), поэтому 490 ₽ ≈ 199 ⭐.
 * Год = 12 месяцев со скидкой 30%: 199 × 12 × 0,7 ≈ 1670 ⭐.
 * Цены синхронизируются с базой при каждом запуске; старые тарифы отключаются (оплаты по ним сохраняются).
 */
export const DEFAULT_PLANS = [
  { code: 'month', title: 'Подписка на 1 месяц', months: 1, starsPrice: 199, rubPrice: 490, aiLimit: 300, sort: 1, active: true },
  { code: 'year', title: 'Подписка на 12 месяцев (−30%)', months: 12, starsPrice: 1670, rubPrice: 4116, aiLimit: 300, sort: 2, active: true },
];

export async function seedPlans() {
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: p, update: p });
  }
  await prisma.plan.updateMany({ where: { code: { notIn: DEFAULT_PLANS.map((p) => p.code) } }, data: { active: false } });
}

/** Продление подписки после ПОДТВЕРЖДЁННОЙ оплаты (вызывается только из обработчика successful_payment бота) */
export async function applyPayment(userId: string, planCode: string, stars: number, chargeId: string, extra: { provider?: string; amountRub?: number } = {}): Promise<{ referrer?: { tgId: bigint; until: Date } } | void> {
  const exists = await prisma.payment.findUnique({ where: { telegramChargeId: chargeId } });
  if (exists) return; // идемпотентность: повторное уведомление не продлевает дважды
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error(`Неизвестный тариф ${planCode}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const base = user.subscriptionUntil && user.subscriptionUntil > new Date() ? user.subscriptionUntil : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + plan.months);
  await prisma.$transaction([
    prisma.payment.create({ data: { userId, planCode, stars, telegramChargeId: chargeId, provider: extra.provider || 'stars', amountRub: extra.amountRub ?? null } }),
    prisma.user.update({ where: { id: userId }, data: { subscriptionUntil: until, subNotice3At: null, subNoticeEndAt: null } }),
  ]);
  return { referrer: (await rewardReferrer(user)) ?? undefined };
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
  app.get('/api/plans', async () => plain(await prisma.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' } })));

  app.get('/api/payments', async (req) => plain(await prisma.payment.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } })));

  // Создать ссылку на оплату в Telegram Stars. Доступ выдаётся только после successful_payment.
  app.post('/api/pay/:code', async (req) => {
    const { code } = req.params as any;
    const plan = await prisma.plan.findFirst({ where: { code, active: true } });
    if (!plan) throw new HttpError(404, 'Тариф не найден');
    if (!opts.bot) throw new HttpError(503, 'Оплата не настроена: бот не подключён', 'payments_unavailable');
    const url = await opts.bot.api.createInvoiceLink(
      plan.title, 'Подписка СМЕТА PRO: сметы, справочники, калькуляторы, финансы объектов',
      `${req.user.id}:${plan.code}`, '', 'XTR', [{ label: plan.title, amount: plan.starsPrice }],
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
    const value = `${plan.rubPrice}.00`;
    const body: any = {
      amount: { value, currency: 'RUB' }, capture: true,
      confirmation: { type: 'redirect', return_url: `${env.PUBLIC_URL || ''}/paid` },
      description: `${plan.title} — СМЕТА PRO`.slice(0, 128),
      metadata: { userId: req.user.id, plan: plan.code },
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
    if (res !== undefined && opts.bot) {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      await opts.bot.api.sendMessage(Number(user.tgId), `Оплата прошла. Подписка активна до ${new Date(fresh.subscriptionUntil!).toLocaleDateString('ru-RU')}.`).catch(() => {});
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
