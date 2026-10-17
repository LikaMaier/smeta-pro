import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { MEDIA_DIR, finishConnect } from './instagram';
import { thFinishConnect } from './threads';
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
import { materialsRoutes } from './routes/materials';

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
        return reply.status(402).send({ error: `Это доступно в тарифе «Про» — ${PRICES.pro} ₽ в месяц, первый месяц — ${PRICES.proFirst} ₽. Бесплатно: сметы без ограничений, справочник, мастера, 3D-конструктор, календарь и напоминания.`, code: 'subscription_required' });
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
  await app.register(materialsRoutes);

  // Telegram webhook
  if (opts.bot && env.PUBLIC_URL) {
    const { webhookCallback } = await import('grammy');
    const cb = webhookCallback(opts.bot, 'fastify', { secretToken: env.WEBHOOK_SECRET || undefined });
    app.post('/bot/webhook', cb as any);
  }

  // Подключение Instagram: сюда Instagram возвращает после входа
  app.get('/ig/callback', async (req, reply) => {
    const q = req.query as any;
    const page = (title: string, text: string) => reply.header('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:17px system-ui;padding:28px;background:#0D2440;color:#EAF4FF"><h1>${title}</h1><p>${text}</p></body>`);
    if (q.error) return page('Не подключено', 'Доступ не разрешён. Отправьте боту /instagram и попробуйте ещё раз.');
    try {
      const r = await finishConnect(String(q.code || ''), String(q.state || ''));
      if (opts.bot) for (const id of r.tg) await opts.bot.api.sendMessage(id, `✅ Instagram @${r.username} подключён. Ролики из очереди можно публиковать кнопкой «Опубликовать».`).catch(() => {});
      return page('Instagram подключён', `Аккаунт @${r.username}. Можно закрыть страницу и вернуться в Telegram.`);
    } catch (e: any) { req.log.error(e, 'ig connect'); return page('Не получилось', String(e.message).replace(/</g, '&lt;')); }
  });

  // Подключение Threads: возврат после входа + обязательные для Meta адреса отключения и удаления данных
  app.get('/threads/callback', async (req, reply) => {
    const q = req.query as any;
    const page = (title: string, text: string) => reply.header('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:17px system-ui;padding:28px;background:#0D2440;color:#EAF4FF"><h1>${title}</h1><p>${text}</p></body>`);
    if (q.error) return page('Не подключено', 'Доступ не разрешён. Отправьте боту /threads и попробуйте ещё раз.');
    try {
      const r = await thFinishConnect(String(q.code || ''), String(q.state || ''));
      if (opts.bot) for (const id of r.tg) await opts.bot.api.sendMessage(id, `✅ Threads @${r.username} подключён. Посты на день будут выходить сами, план пришлю утром.`).catch(() => {});
      return page('Threads подключён', `Аккаунт @${r.username}. Можно закрыть страницу и вернуться в Telegram.`);
    } catch (e: any) { req.log.error(e, 'threads connect'); return page('Не получилось', String(e.message).replace(/</g, '&lt;')); }
  });
  app.post('/threads/uninstall', async () => ({ ok: true }));
  app.post('/threads/delete', async () => ({ url: `${env.PUBLIC_URL}/`, confirmation_code: 'smeta-pro' }));

  // Ролики для Instagram (Instagram скачивает видео по публичной ссылке)
  if (fs.existsSync(MEDIA_DIR)) await app.register(fastifyStatic, { root: MEDIA_DIR, prefix: '/media/', decorateReply: false });

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
