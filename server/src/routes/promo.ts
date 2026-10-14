import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, plain, HttpError } from '../util';
import { env } from '../env';
import { statsData } from '../stats';
import { botLink } from '../botInfo';

/**
 * Промокоды блогеров. Ссылка t.me/бот?start=p_КОД или ввод кода в Настройках.
 * Новичку по коду — длинный пробный «Про»; всем по коду — скидка на первую оплату подписки.
 * Блогеру — процент со всех оплат приведённых им людей (считаем в админке, выплачиваете вы).
 */
import { normCode } from '../../../shared/promo';
import { PRICES } from '../../../shared/plans';
export { normCode };
const PACKS = ['est1', 'est10', 'design1', 'studio_m']; // не подписка «Про»/«Бригада»

/** Были ли у человека оплаты подписки (скидка — только на первую) */
const hadSubscription = async (userId: string) => (await prisma.payment.count({ where: { userId, planCode: { notIn: PACKS } } })) > 0;

type PriceUser = { id: string; promoCode?: string | null; offerPct?: number | null; offerUntil?: Date | null; subscriptionUntil?: Date | null; plan?: string | null; teamUntil?: Date | null };
const rubToStars = (rub: number) => Math.max(1, Math.round(rub / 2.46));

/** Цена тарифа для пользователя: первый месяц «Про», промокод блогера, персональная скидка возврата, 3D-проект дешевле с подпиской.
 *  Из скидок берётся одна — самая выгодная для человека. */
export async function priceFor(user: PriceUser, plan: { code: string; months: number; starsPrice: number; rubPrice: number }) {
  const base = { stars: plan.starsPrice, rub: plan.rubPrice, discountPct: 0, promo: null as string | null, note: null as string | null };
  const now = new Date();
  // 3D-проект: с «Про» или «Бригадой» — дешевле
  if (plan.code === 'design1') {
    const sub = (user.subscriptionUntil && user.subscriptionUntil > now) || (user.teamUntil && user.teamUntil > now);
    return sub ? { ...base, rub: PRICES.designPro, stars: rubToStars(PRICES.designPro), note: 'цена с подпиской' } : base;
  }
  if (plan.months === 0 || plan.code === 'studio_m') return base;
  const options = [base];
  const first = !(await hadSubscription(user.id));
  if (first && plan.code === 'pro_m') options.push({ ...base, rub: PRICES.proFirst, stars: rubToStars(PRICES.proFirst), discountPct: Math.round((1 - PRICES.proFirst / plan.rubPrice) * 100), note: 'первый месяц' });
  if (user.offerPct && user.offerUntil && user.offerUntil > now && plan.code === 'pro_m') {
    const k = 1 - Math.min(90, user.offerPct) / 100;
    options.push({ ...base, rub: Math.max(1, Math.round(plan.rubPrice * k)), stars: Math.max(1, Math.round(plan.starsPrice * k)), discountPct: user.offerPct, note: `скидка до ${user.offerUntil.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` });
  }
  if (user.promoCode && first) {
    const promo = await findPromo(user.promoCode);
    if (promo && promo.discountPct) {
      const k = 1 - Math.min(90, promo.discountPct) / 100;
      options.push({ ...base, stars: Math.max(1, Math.round(plan.starsPrice * k)), rub: Math.max(1, Math.round(plan.rubPrice * k)), discountPct: promo.discountPct, promo: promo.code, note: 'по промокоду' });
    }
  }
  return options.reduce((a, b) => (b.rub < a.rub ? b : a));
}

/** Привязать код. Новичку (isNew) продлеваем пробный «Про» до trialDays. Код у человека один — первый. */
export async function applyPromo(userId: string, code: string, isNew = false) {
  const promo = await findPromo(code);
  if (!promo) throw new HttpError(404, 'Такого промокода нет или он больше не действует');
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.promoCode) {
    if (u.promoCode === promo.code) return { code: promo.code, discountPct: promo.discountPct, already: true };
    throw new HttpError(400, `У вас уже есть промокод ${u.promoCode}`);
  }
  if (await hadSubscription(userId)) throw new HttpError(400, 'Промокод действует для тех, кто ещё не оформлял подписку');
  const trial = isNew && promo.trialDays > 0 ? new Date(Date.now() + promo.trialDays * 864e5) : null;
  await prisma.user.update({ where: { id: userId }, data: { promoCode: promo.code, promoAt: new Date(), ...(trial && trial > u.trialEndsAt ? { trialEndsAt: trial } : {}) } });
  return { code: promo.code, discountPct: promo.discountPct, trialDays: isNew ? promo.trialDays : 0, already: false };
}

const isAdmin = (u: any) => env.ADMIN_TG_IDS.includes(String(u.tgId));

export async function promoRoutes(app: FastifyInstance) {
  // ввести промокод в приложении (доступно и без подписки — путь под /api/pay/)
  app.post('/api/pay/promo', async (req) => {
    const { code } = z.object({ code: z.string().min(1).max(40) }).parse(req.body);
    return applyPromo(req.user.id, code);
  });

  // ---- админка: только владелец приложения ----
  app.get('/api/admin/stats', async (req) => {
    if (!isAdmin(req.user)) throw new HttpError(403, 'Только для администратора');
    const d = Number((req.query as any)?.days);
    return plain(await statsData([0, 1, 7, 30, 90].includes(d) ? d : 0));
  });

  app.get('/api/admin/promos', async (req) => {
    if (!isAdmin(req.user)) throw new HttpError(403, 'Только для администратора');
    const promos = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const out = [];
    for (const p of promos) {
      const [users, pays] = await Promise.all([
        prisma.user.count({ where: { promoCode: p.code } }),
        prisma.payment.findMany({ where: { promoCode: p.code, status: 'paid' }, select: { userId: true, stars: true, amountRub: true, provider: true, createdAt: true } }),
      ]);
      const sum = (xs: typeof pays) => ({ rub: xs.reduce((a, x) => a + (x.provider === 'yookassa' ? x.amountRub || 0 : 0), 0), stars: xs.reduce((a, x) => a + (x.provider === 'stars' ? x.stars : 0), 0) });
      const all = sum(pays), mon = sum(pays.filter((x) => x.createdAt >= month));
      out.push({
        ...p, link: botLink(`p_${p.code}`), users, payers: new Set(pays.map((x) => x.userId)).size, payments: pays.length,
        revenue: all, revenueMonth: mon,
        commission: { rub: Math.round((all.rub * p.commissionPct) / 100), stars: Math.round((all.stars * p.commissionPct) / 100) },
        commissionMonth: { rub: Math.round((mon.rub * p.commissionPct) / 100), stars: Math.round((mon.stars * p.commissionPct) / 100) },
      });
    }
    return plain(out);
  });

  const body = z.object({
    code: z.string().min(3).max(24), name: z.string().trim().min(1).max(120), contact: z.string().max(200).nullable().optional(),
    discountPct: z.number().int().min(0).max(90).default(20), commissionPct: z.number().int().min(0).max(90).default(30), trialDays: z.number().int().min(0).max(60).default(14),
  });
  app.post('/api/admin/promos', async (req) => {
    if (!isAdmin(req.user)) throw new HttpError(403, 'Только для администратора');
    const b = body.parse(req.body);
    const code = normCode(b.code);
    if (code.length < 3) throw new HttpError(400, 'Код — от 3 букв или цифр');
    if (await prisma.promoCode.findFirst({ where: { code } })) throw new HttpError(400, 'Такой код уже есть');
    return plain(await prisma.promoCode.create({ data: { ...b, code } }));
  });
  app.patch('/api/admin/promos/:id', async (req) => {
    if (!isAdmin(req.user)) throw new HttpError(403, 'Только для администратора');
    const b = body.partial().extend({ active: z.boolean().optional() }).omit({ code: true }).parse(req.body);
    return plain(await prisma.promoCode.update({ where: { id: (req.params as any).id }, data: b }));
  });
}
