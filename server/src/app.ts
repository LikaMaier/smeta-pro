import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { User } from '@prisma/client';
import { env } from './env';
import { PRICES } from '../../shared/plans';
import { prisma, handleError, HttpError, accessOf, freeCtx } from './util';
import { freeWriteAllowed, needsEstimateCtx } from '../../shared/access';
import { verifySession } from './auth';
import { authRoutes } from './routes/auth';
import { catalogRoutes } from './routes/catalog';
import { estimateRoutes } from './routes/estimates';
import { projectRoutes } from './routes/projects';
import { noteRoutes } from './routes/notes';
import { billingRoutes } from './routes/billing';
import { aiRoutes } from './routes/ai';
import { calendarRoutes } from './routes/calendar';
import { organizerRoutes } from './routes/organizer';
import { shareRoutes } from './routes/share';
import { brandRoutes } from './routes/brand';
import { actRoutes } from './routes/acts';
import { designerRoutes } from './routes/designer';
import { teamRoutes } from './routes/team';
import { promoRoutes } from './routes/promo';

declare module 'fastify' {
  interface FastifyRequest { user: User }
}

// Маршруты, доступные без активной подписки (вход, настройки, оплата)
const OPEN_WRITE = [/^\/api\/auth\//, /^\/api\/me$/, /^\/api\/pay\//];

export async function buildApp(opts: { bot?: any; logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 2 * 1024 * 1024 });
  app.decorateRequest('user', null as any);
  app.setErrorHandler((err, _req, reply) => handleError(err, reply));

  // Авторизация и проверка подписки для всех /api, кроме входа
  app.addHook('preHandler', async (req: FastifyRequest, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/') || url.startsWith('/api/auth/') || url === '/api/health') return;
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uid = verifySession(token, env.SESSION_SECRET || 'dev-secret');
    if (!uid) return reply.status(401).send({ error: 'Сессия истекла. Откройте приложение заново.', code: 'unauthorized' });
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) return reply.status(401).send({ error: 'Пользователь не найден', code: 'unauthorized' });
    req.user = user;
    const isWrite = req.method !== 'GET';
    if (isWrite && !OPEN_WRITE.some((r) => r.test(url)) && !accessOf(user).active) {
      const ctx = needsEstimateCtx(url) ? await freeCtx(user.id, user.extraEstimates) : { estimateCount: 99, freeEstimateIds: [] };
      if (!freeWriteAllowed(req.method, url, ctx)) {
        return reply.status(402).send({ error: `Это доступно в тарифе «Про» — ${PRICES.pro} ₽ в месяц, первый месяц — ${PRICES.proFirst} ₽. Бесплатно: 3 сметы каждый месяц, справочник, мастера, календарь и напоминания.`, code: 'subscription_required' });
      }
    }
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(catalogRoutes, { bot: opts.bot });
  await app.register(estimateRoutes, { bot: opts.bot });
  await app.register(projectRoutes, { bot: opts.bot });
  await app.register(noteRoutes);
  await app.register(billingRoutes, { bot: opts.bot });
  await app.register(aiRoutes);
  await app.register(calendarRoutes);
  await app.register(organizerRoutes);
  await app.register(shareRoutes, { bot: opts.bot });
  await app.register(brandRoutes);
  await app.register(actRoutes, { bot: opts.bot });
  await app.register(designerRoutes, { bot: opts.bot });
  await app.register(teamRoutes, { bot: opts.bot });
  await app.register(promoRoutes);

  // Telegram webhook
  if (opts.bot && env.PUBLIC_URL) {
    const { webhookCallback } = await import('grammy');
    const cb = webhookCallback(opts.bot, 'fastify', { secretToken: env.WEBHOOK_SECRET || undefined });
    app.post('/bot/webhook', cb as any);
  }

  // Статика Mini App
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, '../../web/dist');
  if (fs.existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Не найдено' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

export function requireOwn<T extends { userId: string } | null>(row: T, what = 'Запись'): NonNullable<T> {
  if (!row) throw new HttpError(404, `${what} не найдена`, 'not_found');
  return row as NonNullable<T>;
}
