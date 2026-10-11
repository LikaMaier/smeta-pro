import { FREE_ESTIMATES } from '../../shared/access';
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

export function accessOf(u: { trialEndsAt: Date; subscriptionUntil: Date | null; tgId?: bigint | number }) {
  const now = Date.now();
  if (u.tgId != null && env.ADMIN_TG_IDS.includes(String(u.tgId))) {
    return { active: true, mode: 'admin', until: new Date(now + 3650 * 864e5).toISOString(), daysLeft: 3650 };
  }
  const sub = u.subscriptionUntil && u.subscriptionUntil.getTime() > now;
  const trial = u.trialEndsAt.getTime() > now;
  const until = sub ? u.subscriptionUntil! : trial ? u.trialEndsAt : (u.subscriptionUntil || u.trialEndsAt);
  return {
    active: Boolean(sub || trial),
    mode: sub ? 'subscription' : trial ? 'trial' : u.subscriptionUntil ? 'expired' : 'free',
    until: until.toISOString(),
    daysLeft: Math.max(0, Math.ceil((until.getTime() - now) / 86400000)),
  };
}

/** Данные для бесплатного режима: сколько смет создано и какие из них бесплатные (первые FREE_ESTIMATES) */
export async function freeCtx(userId: string) {
  const [estimateCount, first] = await Promise.all([
    prisma.estimate.count({ where: { userId, isTemplate: false } }), // удалённые тоже считаются
    prisma.estimate.findMany({ where: { userId, isTemplate: false }, orderBy: { createdAt: 'asc' }, select: { id: true }, take: FREE_ESTIMATES }),
  ]);
  return { estimateCount, freeEstimateIds: first.map((e) => e.id) };
}
