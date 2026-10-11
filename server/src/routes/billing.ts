import type { FastifyInstance } from 'fastify';
import { prisma, plain, HttpError } from '../util';

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
export async function applyPayment(userId: string, planCode: string, stars: number, chargeId: string): Promise<{ referrer?: { tgId: bigint; until: Date } } | void> {
  const exists = await prisma.payment.findUnique({ where: { telegramChargeId: chargeId } });
  if (exists) return; // идемпотентность: повторное уведомление не продлевает дважды
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error(`Неизвестный тариф ${planCode}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const base = user.subscriptionUntil && user.subscriptionUntil > new Date() ? user.subscriptionUntil : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + plan.months);
  await prisma.$transaction([
    prisma.payment.create({ data: { userId, planCode, stars, telegramChargeId: chargeId } }),
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
}
