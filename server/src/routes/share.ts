import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { env } from '../env';
import { prisma, plain, audit, accessOf, HttpError } from '../util';
import { can, PRICES } from '../../../shared/plans';
import { loadEstimate, estimateTotals, estimateNumber, estimatePaid, docData } from './estimates';
import { pdfData, renderPdf, fileName } from '../pdf';
import { brandPath } from '../brand';
import { botLink } from '../botInfo';
import { estimatePage, page, esc, money } from '../sharePage';
import { designForEstimate } from './designer';

/**
 * Ссылка на смету для заказчика: страница без входа в Telegram,
 * кнопки «Согласовать» и «Задать вопрос». Исполнитель получает уведомления в бот.
 */

const dt = (d: Date) => d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const shareUrl = (token: string) => `${env.PUBLIC_URL || ''}/s/${token}`;

const COMMENT_MAX = 6000;
const lastComment = new Map<string, number>(); // защита от флуда: не чаще раза в 15 секунд на ссылку

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return prisma.estimate.findFirst({
    where: { shareToken: token, deletedAt: null },
    include: { lines: { orderBy: { position: 'asc' } }, user: true },
  });
}

async function notify(bot: any, e: any, text: string) {
  if (!bot) return;
  const kb = env.PUBLIC_URL ? { inline_keyboard: [[{ text: 'Открыть смету', web_app: { url: `${env.PUBLIC_URL}/estimates/${e.id}` } }]] } : undefined;
  await bot.api.sendMessage(Number(e.user.tgId), text, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

export const shareView = (e: any) => ({
  url: e.shareToken ? shareUrl(e.shareToken) : null, sharedAt: e.sharedAt, viewedAt: e.viewedAt,
  approvedAt: e.approvedAt, customerComment: e.customerComment,
});

export async function shareRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  // ---- Для исполнителя ----
  app.post('/api/estimates/:id/share', async (req) => {
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    if (!e.lines.length) throw new HttpError(400, 'Добавьте в смету хотя бы одну позицию');
    const token = e.shareToken || crypto.randomBytes(18).toString('base64url');
    const upd = await prisma.estimate.update({
      where: { id: e.id },
      data: { shareToken: token, sharedAt: e.sharedAt || new Date(), ...(e.status === 'draft' ? { status: 'sent' } : {}) },
    });
    await audit(req.user.id, 'estimate', e.id, 'share');
    return plain({ ...shareView(upd), status: upd.status });
  });

  app.get('/api/estimates/:id/share', async (req) => plain(shareView(await loadEstimate(req.user.id, (req.params as any).id))));

  // Отозвать ссылку: старая перестанет открываться
  app.delete('/api/estimates/:id/share', async (req) => {
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    const upd = await prisma.estimate.update({ where: { id: e.id }, data: { shareToken: null } });
    await audit(req.user.id, 'estimate', e.id, 'unshare');
    return plain(shareView(upd));
  });

  // ---- Публичная страница для заказчика ----
  app.get('/s/:token', async (req, reply) => {
    const e = await byToken((req.params as any).token);
    reply.header('Content-Type', 'text/html; charset=utf-8').header('X-Robots-Tag', 'noindex').header('Referrer-Policy', 'no-referrer');
    if (!e) return reply.status(404).send(page('Смета недоступна', `<div class="card"><h1>Смета недоступна</h1><p class="muted">Ссылка устарела или исполнитель её отозвал. Попросите прислать новую.</p></div>`));
    if (!e.viewedAt) {
      const first = await prisma.estimate.updateMany({ where: { id: e.id, viewedAt: null }, data: { viewedAt: new Date() } });
      if (first.count) await notify(opts.bot, e, `👀 Заказчик открыл смету «${esc(e.title)}».`);
    }
    const number = await estimateNumber(e.userId, e);
    return reply.send(estimatePage(pdfData(e, e.user, number, false, await estimatePaid(e)), {
      token: (req.params as any).token, number, hasLogo: Boolean(brandPath(e.user.logoFile)), approvedAt: e.approvedAt,
      title: e.title, customer: e.customer, address: e.address, date: e.date, validDays: e.validDays ?? 14,
      paymentTerms: e.paymentTerms, notes: e.notes, botUrl: botLink('site'), designUrl: await designForEstimate(e.id),
      hideBrand: can(accessOf(e.user).tier, 'whiteLabel'), company: e.user.companyName || null,
    }));
  });

  app.get('/s/:token/pdf', async (req, reply) => {
    const e = await byToken((req.params as any).token);
    if (!e) return reply.status(404).send({ error: 'Смета недоступна' });
    const pdf = await renderPdf(await docData(e, e.user, !accessOf(e.user).active));
    return reply.header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName(e.title, 'pdf'))}`).send(pdf);
  });

  app.get('/s/:token/logo', async (req, reply) => {
    const e = await byToken((req.params as any).token);
    const p = e && brandPath(e.user.logoFile);
    if (!p) return reply.status(404).send();
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=3600').send(await fs.readFile(p));
  });

  app.post('/s/:token/approve', async (req, reply) => {
    const token = (req.params as any).token;
    const e = await byToken(token);
    if (!e) return reply.status(404).send({ error: 'Смета недоступна' });
    const { name } = z.object({ name: z.string().trim().max(120).optional() }).parse(req.body || {});
    if (e.approvedAt) return { ok: true, approvedAt: e.approvedAt };
    const now = new Date();
    const claimed = await prisma.estimate.updateMany({
      where: { id: e.id, approvedAt: null },
      data: {
        approvedAt: now, status: 'approved',
        customerComment: appendLog(e.customerComment, now, `✅ Смета согласована${name ? ` (${name})` : ''}`),
      },
    });
    if (claimed.count) {
      await audit(e.userId, 'estimate', e.id, 'customer_approved', { name });
      const total = estimateTotals(e).total;
      const acc = accessOf(e.user);
      // момент, когда приложение принесло заказ, — честное место предложить тариф
      const pctOf = (p: number) => (total > 0 ? String(Math.max(0.01, Math.round((p / total) * 10000) / 100)).replace('.', ',') : '');
      const offer = acc.mode === 'trial'
        ? `\n\nСледующий шаг — договор подряда: откройте смету и нажмите «Договор» (в пробном периоде он уже доступен). После пробного договор и акты — в «Про»: ${PRICES.pro} ₽ в месяц${total > 0 ? ` — это ${pctOf(PRICES.pro)}% от этого заказа` : ''}, первый месяц ${PRICES.proFirst} ₽.`
        : !can(acc.tier, 'docs')
          ? `\n\nСледующий шаг — договор подряда и акты. Они в тарифе «Про»: ${PRICES.pro} ₽ в месяц${total > 0 ? ` — это <b>${pctOf(PRICES.pro)}% от этого заказа</b>` : ''}. Первый месяц — ${PRICES.proFirst} ₽.`
          : '\n\nСледующий шаг — договор подряда: откройте смету и нажмите «Договор».';
      await notify(opts.bot, e, `✅ <b>Заказчик согласовал смету</b> «${esc(e.title)}» на ${money(total)}${name ? `\nКто: ${esc(name)}` : ''}${offer}`);
    }
    return { ok: true, approvedAt: now };
  });

  app.post('/s/:token/comment', async (req, reply) => {
    const token = (req.params as any).token;
    const e = await byToken(token);
    if (!e) return reply.status(404).send({ error: 'Смета недоступна' });
    const { text, name } = z.object({ text: z.string().trim().min(1, 'Напишите вопрос').max(1000), name: z.string().trim().max(120).optional() }).parse(req.body || {});
    const last = lastComment.get(token) || 0;
    if (Date.now() - last < 15000) return reply.status(429).send({ error: 'Подождите несколько секунд и отправьте снова' });
    lastComment.set(token, Date.now());
    const now = new Date();
    await prisma.estimate.update({ where: { id: e.id }, data: { customerComment: appendLog(e.customerComment, now, `💬 ${name ? `${name}: ` : ''}${text}`) } });
    await notify(opts.bot, e, `💬 <b>Вопрос по смете</b> «${esc(e.title)}»${name ? ` от ${esc(name)}` : ''}:\n\n${esc(text)}`);
    return { ok: true };
  });
}

function appendLog(prev: string | null, at: Date, line: string) {
  const s = `${prev ? `${prev}\n` : ''}[${dt(at)}] ${line}`;
  return s.length > COMMENT_MAX ? s.slice(s.length - COMMENT_MAX) : s;
}

