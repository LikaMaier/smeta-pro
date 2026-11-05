import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { env } from '../env';
import { prisma, audit, accessOf, freeCtx } from '../util';
import { can, PRICES } from '../../../shared/plans';
import { FREE_ESTIMATES } from '../../../shared/access';
import { brandPath } from '../brand';
import { botLink } from '../botInfo';
import { getJob, jobTotals } from '../../../shared/firstJobs';
import { normPhone, priceOverrides, calcJobIds, cleanInput, calcLines, toEstimateLines } from '../../../shared/leadCalc';
import { TIER_LABEL } from '../../../shared/materialTiers';

/**
 * «Калькулятор для заказчиков» — личная ссылка мастера /k/<token>.
 * Заказчик без Telegram выбирает работу и размер, видит цену по ценам мастера и оставляет телефон →
 * у мастера в приложении готовая смета, в боте — «🔥 Заявка». Настройки и счётчики — в AppKV и журнале (без новых таблиц).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../web/dist');
let tpl: string | null = null;
async function calcHtml() {
  if (tpl && process.env.NODE_ENV === 'production') return tpl;
  const f = path.join(DIST, 'calc.html');
  tpl = fs.existsSync(f) ? await fsp.readFile(f, 'utf8') : null;
  return tpl;
}
const escJson = (o: any) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
const escHtml = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;
const NOT_FOUND = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Калькулятор недоступен</title><body style="font:16px system-ui;padding:24px;background:#f4f1ea;color:#22180f"><h1>Калькулятор недоступен</h1><p>Ссылка устарела. Попросите мастера прислать новую.</p></body>';

interface Cfg { t: string; jobs: string[] | null }
const kU = (userId: string) => `kcalc:u:${userId}`;
const kT = (token: string) => `kcalc:t:${token}`;
export const calcUrl = (t: string) => `${env.PUBLIC_URL || ''}/k/${t}`;

/** Настройки калькулятора мастера; ссылка создаётся при первом обращении */
export async function calcCfg(userId: string, create = true): Promise<Cfg | null> {
  const row = await prisma.appKV.findUnique({ where: { key: kU(userId) } });
  if (row) { try { const c = JSON.parse(row.value); if (c?.t) return c; } catch { /* испорчено — создадим заново */ } }
  if (!create) return null;
  const cfg: Cfg = { t: crypto.randomBytes(9).toString('base64url'), jobs: null };
  await prisma.appKV.create({ data: { key: kT(cfg.t), value: userId } });
  await prisma.appKV.upsert({ where: { key: kU(userId) }, create: { key: kU(userId), value: JSON.stringify(cfg) }, update: { value: JSON.stringify(cfg) } });
  return cfg;
}
async function ownerOf(token: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  const row = await prisma.appKV.findUnique({ where: { key: kT(token) } });
  if (!row) return null;
  const user = await prisma.user.findUnique({ where: { id: row.value } });
  if (!user) return null;
  const cfg = (await calcCfg(user.id, false)) || { t: token, jobs: null };
  return { user, cfg };
}
const tradeOfUser = async (tgId: bigint) => (await prisma.appKV.findUnique({ where: { key: `trade:${tgId}` } }).catch(() => null))?.value || null;
const ownPrices = async (userId: string) => priceOverrides(await prisma.catalogItem.findMany({ where: { userId, deletedAt: null, active: true }, select: { name: true, price: true } }));
const masterName = (u: { companyName?: string | null; firstName?: string | null }) => u.companyName || (u.firstName ? `Мастер ${u.firstName}` : 'Мастер');

// защита от спама: на ссылку — не чаще раза в 20 секунд, с одного адреса — 6 заявок в час, мастеру — 40 в сутки
const lastByToken = new Map<string, number>();
const byIp = new Map<string, number[]>();

export async function calcRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  // ---------- мастеру: ссылка, какие работы показывать, сколько открыли и прислали ----------
  const view = async (user: any) => {
    const cfg = (await calcCfg(user.id))!;
    const [views, leads] = await Promise.all([
      prisma.auditLog.count({ where: { userId: user.id, entity: 'calc', action: 'view' } }),
      prisma.auditLog.count({ where: { userId: user.id, entity: 'calc', action: 'lead' } }),
    ]);
    return { url: calcUrl(cfg.t), jobs: calcJobIds(cfg.jobs, await tradeOfUser(user.tgId)), custom: Boolean(cfg.jobs), views, leads, name: masterName(user) };
  };
  app.get('/api/mycalc', async (req) => view(req.user));
  app.patch('/api/mycalc', async (req) => {
    const { jobs } = z.object({ jobs: z.array(z.string().max(40)).max(40) }).parse(req.body);
    const cfg = (await calcCfg(req.user.id))!;
    const ok = [...new Set(jobs.filter((id) => getJob(id)))];
    cfg.jobs = ok.length ? ok : null; // ничего не выбрано — по специальности
    await prisma.appKV.update({ where: { key: kU(req.user.id) }, data: { value: JSON.stringify(cfg) } });
    return view(req.user);
  });

  // ---------- заказчику: страница калькулятора ----------
  app.get('/k/:token', async (req, reply) => {
    const token = String((req.params as any).token || '');
    reply.header('Content-Type', 'text/html; charset=utf-8').header('X-Robots-Tag', 'noindex').header('Referrer-Policy', 'no-referrer').header('Cache-Control', 'no-cache');
    const [owner, html] = await Promise.all([ownerOf(token), calcHtml()]);
    if (!owner || !html) return reply.status(404).send(NOT_FOUND);
    const { user, cfg } = owner;
    const data = {
      token, company: masterName(user), contacts: user.contacts || null,
      logo: brandPath(user.logoFile) ? `/k/${token}/logo` : null,
      jobs: calcJobIds(cfg.jobs, await tradeOfUser(user.tgId)), own: await ownPrices(user.id),
      hideBrand: can(accessOf(user).tier, 'whiteLabel'), botUrl: botLink('kcalc'),
    };
    // мастер смотрит свою страницу (?me=1) — не считаем
    if (!(req.query as any)?.me) {
      const first = (await prisma.auditLog.count({ where: { userId: user.id, entity: 'calc', action: 'view' } })) === 0;
      await audit(user.id, 'calc', token, 'view').catch(() => {});
      if (first && opts.bot) {
        await opts.bot.api.sendMessage(Number(user.tgId), '👀 Ваш калькулятор для заказчиков впервые открыли. Как только заказчик оставит телефон — заявка с готовой сметой придёт сюда.').catch(() => {});
      }
    }
    return reply.send(html.replace('<!--CALC_DATA-->', () => `<script>window.__CALC__=${escJson(data)}</script>`)
      .replace(/<title>[^<]*<\/title>/, () => `<title>${escHtml(data.company)} — расчёт стоимости работ</title>`));
  });
  app.get('/k/:token/logo', async (req, reply) => {
    const o = await ownerOf(String((req.params as any).token || ''));
    const p = o && brandPath(o.user.logoFile);
    if (!p) return reply.status(404).send();
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=3600').send(await fsp.readFile(p));
  });

  // ---------- заявка: смета у мастера + уведомление в бот ----------
  app.post('/k/:token/lead', async (req, reply) => {
    const token = String((req.params as any).token || '');
    const b = z.object({
      job: z.string().max(40),
      sizes: z.record(z.string().max(20), z.any()).optional(),
      opts: z.record(z.string().max(20), z.any()).optional(),
      tier: z.enum(['eco', 'std', 'prem']).default('std'),
      name: z.string().trim().max(80).optional(),
      phone: z.string().trim().max(40),
      comment: z.string().trim().max(500).optional(),
      site: z.string().max(200).optional(), // скрытое поле-ловушка: человек его не видит и не заполняет
    }).parse(req.body || {});
    const owner = await ownerOf(token);
    if (!owner) return reply.status(404).send({ error: 'Калькулятор недоступен' });
    if (b.site) return { ok: true };
    const phone = normPhone(b.phone);
    if (!phone) return reply.status(400).send({ error: 'Проверьте телефон — например, +7 921 123-45-67' });
    const { user, cfg } = owner;
    if (!calcJobIds(cfg.jobs, await tradeOfUser(user.tgId)).includes(b.job)) return reply.status(400).send({ error: 'Выберите работу из списка' });
    const now = Date.now();
    if (now - (lastByToken.get(token) || 0) < 20e3) return reply.status(429).send({ error: 'Заявка уже отправлена. Если нужно ещё одну — подождите полминуты.' });
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const hits = (byIp.get(ip) || []).filter((t) => now - t < 3600e3);
    if (hits.length >= 6) return reply.status(429).send({ error: 'Слишком много заявок с этого устройства. Попробуйте через час.' });
    const day = await prisma.auditLog.count({ where: { userId: user.id, entity: 'calc', action: 'lead', createdAt: { gte: new Date(now - 864e5) } } });
    if (day >= 40) return reply.status(429).send({ error: 'Мастер сегодня получил очень много заявок — позвоните ему напрямую.' });
    lastByToken.set(token, now);
    byIp.set(ip, [...hits, now]);

    const inp = cleanInput(b.job, b.sizes, b.opts)!;
    const job = getJob(b.job)!;
    const lines = calcLines(b.job, inp.sizes, inp.opts, b.tier, await ownPrices(user.id));
    if (!lines.length) return reply.status(400).send({ error: 'Не получилось посчитать — проверьте размеры' });
    const total = jobTotals(lines).total;
    const e = await prisma.estimate.create({
      data: {
        userId: user.id, title: `${job.name(inp.sizes)} — заявка`, source: 'lead',
        customer: b.name || 'Заказчик с калькулятора', customerDetails: `Телефон: ${phone}`,
        notes: `Расчёт по калькулятору: материалы — «${TIER_LABEL[b.tier]}». Цены предварительные, уточняются после замера.${b.comment ? `\nКомментарий заказчика: ${b.comment}` : ''}`,
        lines: { create: toEstimateLines(lines) },
      },
    });
    await audit(user.id, 'estimate', e.id, 'create', { lead: b.job, tier: b.tier });
    await audit(user.id, 'calc', token, 'lead', { job: b.job, tier: b.tier, estimateId: e.id });

    // смета сверх бесплатных — честно: телефон заказчика здесь, а работать со сметой — по тарифу
    let extra = '';
    if (!accessOf(user).active && !(await freeCtx(user.id, user.extraEstimates)).freeEstimateIds.includes(e.id)) {
      extra = `\n\nЭта смета — сверх бесплатных ${FREE_ESTIMATES} в месяц: телефон заказчика выше, а править и отправлять смету можно в «Лайт» (первый месяц ${PRICES.liteFirst} ₽).`;
    }
    const text = `🔥 <b>Заявка с вашего калькулятора!</b>\n${escHtml(job.name(inp.sizes))} — <b>${rub(total)}</b> (материалы: ${TIER_LABEL[b.tier].toLowerCase()})\n` +
      `👤 ${escHtml(b.name || 'без имени')} · ☎️ ${phone}${b.comment ? `\n💬 «${escHtml(b.comment)}»` : ''}\n\n` +
      `Смета уже в приложении: проверьте цены, уточните после замера и отправьте заказчику ссылку — он согласует одной кнопкой.${extra}`;
    await opts.bot?.api.sendMessage(Number(user.tgId), text, {
      parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      reply_markup: env.PUBLIC_URL ? { inline_keyboard: [[{ text: 'Открыть смету', web_app: { url: `${env.PUBLIC_URL}/estimates/${e.id}` } }]] } : undefined,
    }).catch((err: any) => req.log.error({ err }, 'lead notify'));
    return { ok: true, total };
  });
}
