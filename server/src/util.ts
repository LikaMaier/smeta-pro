import { freeAllowance } from '../../shared/access';
import { TIERS, can, FEATURE_MSG, monthKey, type Tier, type Feature } from '../../shared/plans';
import { PrismaClient, Prisma } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { env } from './env';

export const prisma = new PrismaClient();

/** Prisma Decimal/BigInt -> JSON-friendly числа */
export function plain<T = any>(v: any): T {
  if (v == null) return v;
  if (typeof v === 'bigint') return Number(v) as any;
  if (v instanceof Prisma.Decimal) return v.toNumber() as any;
  if (v instanceof Date) return v.toISOString() as any;
  if (Array.isArray(v)) return v.map(plain) as any;
  if (typeof v === 'object') {
    const o: any = {};
    for (const [k, val] of Object.entries(v)) o[k] = plain(val);
    return o;
  }
  return v;
}

export const num = (v: any): number => (v == null ? 0 : typeof v === 'object' && 'toNumber' in v ? v.toNumber() : Number(v));

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const notFound = (what = 'Запись') => new HttpError(404, `${what} не найдена`, 'not_found');

export function handleError(err: any, reply: FastifyReply) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return reply.status(400).send({ error: `Проверьте поле «${first.path.join('.')}»: ${first.message}`, code: 'validation', issues: err.issues });
  }
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, code: err.code });
  if (err?.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
  reply.log.error(err);
  return reply.status(500).send({ error: 'Внутренняя ошибка сервера. Попробуйте ещё раз.', code: 'internal' });
}

export async function audit(userId: string, entity: string, entityId: string, action: string, data?: any) {
  try {
    await prisma.auditLog.create({ data: { userId, entity, entityId, action, data: data ?? undefined } });
  } catch { /* журнал не должен ломать основной запрос */ }
}

export const DEFAULT_CATEGORIES = [
  'Земляные работы', 'Фундамент', 'Бетон', 'Кирпичная кладка', 'Кровля', 'Гипсокартон', 'Отделка', 'Электрика',
  'Водоснабжение', 'Канализация', 'Отопление', 'Газификация', 'Заборы', 'Площадки ТКО', 'Аренда техники', 'Доставка', 'Работы бригады',
];

type AccessUser = { trialEndsAt: Date; subscriptionUntil: Date | null; tgId?: bigint | number; plan?: string | null; teamUntil?: Date | null };
const TIER_OK = ['lite', 'pro', 'team'];

/** Доступ: режим (подписка / бригада / пробный / бесплатно) и уровень тарифа */
export function accessOf(u: AccessUser) {
  const now = Date.now();
  if (u.tgId != null && env.ADMIN_TG_IDS.includes(String(u.tgId))) {
    return { active: true, mode: 'admin', tier: 'team' as Tier, until: new Date(now + 3650 * 864e5).toISOString(), daysLeft: 3650 };
  }
  const sub = Boolean(u.subscriptionUntil && u.subscriptionUntil.getTime() > now);
  const team = Boolean(u.teamUntil && u.teamUntil.getTime() > now);
  const trial = u.trialEndsAt.getTime() > now;
  const until = sub ? u.subscriptionUntil! : team ? u.teamUntil! : trial ? u.trialEndsAt : (u.subscriptionUntil || u.trialEndsAt);
  const tier: Tier = sub ? ((TIER_OK.includes(u.plan || '') ? u.plan : 'pro') as Tier) : team ? 'team' : trial ? 'pro' : 'free';
  return {
    active: sub || team || trial,
    mode: sub ? 'subscription' : team ? 'team' : trial ? 'trial' : u.subscriptionUntil ? 'expired' : 'free',
    tier,
    until: until.toISOString(),
    daysLeft: Math.max(0, Math.ceil((until.getTime() - now) / 86400000)),
  };
}

/** Проверка возможности тарифа: 402 с понятным текстом, если уровень ниже */
export function requireFeature(u: AccessUser, f: Feature) {
  if (!can(accessOf(u).tier, f)) throw new HttpError(402, FEATURE_MSG[f], 'plan_required');
}

/** Учёт запроса к ИИ: лимит по тарифу на месяц. Счётчик сбрасывается с новым месяцем. */
export async function useAi(u: AccessUser & { id: string }, n = 1) {
  const tier = accessOf(u).tier;
  const limit = TIERS[tier].ai;
  if (!limit) throw new HttpError(402, FEATURE_MSG.ai, 'plan_required');
  const m = monthKey();
  // новый месяц — обнуляем счётчик
  await prisma.user.updateMany({ where: { id: u.id, OR: [{ aiMonth: null }, { aiMonth: { not: m } }] }, data: { aiMonth: m, aiUsed: 0 } });
  const ok = await prisma.user.updateMany({ where: { id: u.id, aiMonth: m, aiUsed: { lte: limit - n } }, data: { aiUsed: { increment: n } } });
  if (!ok.count) throw new HttpError(429, `Лимит ИИ на этот месяц исчерпан (${limit} запросов). ${tier === 'team' ? 'Он обновится 1-го числа.' : 'Тариф «Бригада» — 1000 запросов.'}`, 'ai_limit');
}

/** Данные для бесплатного режима: 3 сметы в месяц + купленные раньше пакеты.
 *  estimateCount — создано в этом месяце, limit — сколько можно всего в этом месяце (estimateCount + остаток). */
export async function freeCtx(userId: string, extra?: number) {
  const more = extra ?? (await prisma.user.findUnique({ where: { id: userId }, select: { extraEstimates: true } }))?.extraEstimates ?? 0;
  const list = await prisma.estimate.findMany({ where: { userId, isTemplate: false }, select: { id: true, createdAt: true } }); // удалённые тоже считаются
  const a = freeAllowance(list, Math.max(0, more), monthKey(), (d) => monthKey(d));
  return { estimateCount: a.thisMonth, freeEstimateIds: a.freeIds, limit: a.thisMonth + a.left };
}
