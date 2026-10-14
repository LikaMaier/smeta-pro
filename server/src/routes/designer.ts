import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { prisma, plain, notFound, HttpError, accessOf, audit, useAi, requireFeature } from '../util';
import { CANOPY_DEFAULT } from '../../../shared/design/canopy';
import { buildDesign, designKindOf } from '../../../shared/design/build';
import { designPdfData } from '../../../shared/design/report';
import { CANOPY_AI_SCHEMA, CANOPY_AI_PROMPT, mergeAiParams } from '../../../shared/design/ai';
import { chatJson, aiConfigured } from '../ai/openai';
import { renderDesign, fileName } from '../pdf';
import { brandPath } from '../brand';
import { botLink, botInfo } from '../botInfo';
import { loadEstimate } from './estimates';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBJ_LABEL } from '../../../shared/design/canopy';
import { TIERS, PRICES, can, monthKey } from '../../../shared/plans';

/** 3D-проект для заказчика — отдельная премиальная покупка.
 *  Чистый PDF и 3D-ссылка: «Бригада», «3D-Студия», проект оплачен (paidAt) или есть купленный проект (кредит — тратится на этот объект).
 *  Без оплаты — черновой PDF с водяным знаком: бесплатно 1 всего, с подпиской — несколько в месяц. */
export const studioActive = (u: any) => Boolean(u.studioUntil && new Date(u.studioUntil) > new Date());
const premiumUser = (u: any) => studioActive(u) || accessOf(u).tier === 'team';
const projectOffer = (u: any) => {
  const sub = accessOf(u).mode === 'subscription' || accessOf(u).mode === 'team';
  return `3D-проект для заказчика (PDF без водяного знака + 3D-ссылка) — ${sub ? PRICES.designPro : PRICES.design} ₽ за объект${sub ? '' : ` (с «Про» — ${PRICES.designPro} ₽)`}, или «3D-Студия» без ограничений — ${PRICES.studio} ₽ в месяц.`;
};
/** Можно ли выдать чистый проект; при необходимости тратит купленный кредит и отмечает объект оплаченным */
async function cleanProject(u: any, designId?: string | null): Promise<boolean> {
  if (premiumUser(u)) return true;
  const d = designId ? await prisma.design.findFirst({ where: { id: designId, userId: u.id, deletedAt: null }, select: { id: true, paidAt: true } }) : null;
  if (d?.paidAt) return true;
  if ((u.extraDesigns || 0) > 0) {
    const took = await prisma.user.updateMany({ where: { id: u.id, extraDesigns: { gt: 0 } }, data: { extraDesigns: { decrement: 1 } } });
    if (took.count) {
      if (d) await prisma.design.update({ where: { id: d.id }, data: { paidAt: new Date() } });
      return true;
    }
  }
  return false;
}
/** Черновой PDF (с водяным знаком): остался ли лимит */
async function draftLeft(u: any) {
  const tier = accessOf(u).tier;
  const limit = TIERS[tier].designPdf;
  const since = tier === 'free' ? new Date(0) : new Date(`${monthKey()}-01T00:00:00+03:00`);
  const used = await prisma.auditLog.count({ where: { userId: u.id, entity: 'design', action: 'pdf_draft', createdAt: { gte: since } } });
  return used < limit;
}
/** Решение для PDF: 'clean' | 'draft', иначе 402 с предложением купить */
export async function designPdfMode(u: any, designId?: string | null): Promise<'clean' | 'draft'> {
  if (await cleanProject(u, designId)) return 'clean';
  if (await draftLeft(u)) return 'draft';
  throw new HttpError(402, `Черновые PDF с водяным знаком закончились. ${projectOffer(u)}`, 'design_required', designId || undefined);
}

const viewUrl = (token: string) => `${env.PUBLIC_URL || ''}/v/${token}`;
const newToken = () => crypto.randomBytes(18).toString('base64url');
const escJson = (o: any) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../web/dist');
let viewerTpl: string | null = null;
async function viewerHtml() {
  if (viewerTpl && process.env.NODE_ENV === 'production') return viewerTpl;
  const f = path.join(DIST, 'viewer.html');
  viewerTpl = fs.existsSync(f) ? await fsp.readFile(f, 'utf8') : null;
  return viewerTpl;
}
async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return prisma.design.findFirst({ where: { shareToken: token, deletedAt: null }, include: { user: true } });
}
export async function designForEstimate(estimateId: string) {
  const d = await prisma.design.findFirst({ where: { estimateId, deletedAt: null, shareToken: { not: null } }, orderBy: { updatedAt: 'desc' } });
  return d ? `/v/${d.shareToken}` : null;
}

/** ИИ-проектировщик: проекты (параметры модели), разбор описания ИИ, PDF «Эскизный проект» */
const paramsSchema = z.record(z.string(), z.any());
const lineSchema = z.object({ name: z.string().max(300), qty: z.coerce.number().min(0), unit: z.string().max(30), price: z.coerce.number().min(0), type: z.string().max(20) });

export async function designerRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  app.get('/api/designs', async (req) => {
    const { kind } = z.object({ kind: z.enum(['canopy', 'fence', 'site', 'mep']).optional() }).parse(req.query);
    return plain(await prisma.design.findMany({ where: { userId: req.user.id, deletedAt: null, ...(kind ? { kind } : {}) }, orderBy: { updatedAt: 'desc' }, take: 100 }));
  });

  app.post('/api/designs', async (req) => {
    const b = z.object({ title: z.string().trim().min(1).max(200), params: paramsSchema, kind: z.string().default('canopy') }).parse(req.body);
    const d = await prisma.design.create({ data: { userId: req.user.id, title: b.title, params: b.params, kind: designKindOf(b.params) } });
    await audit(req.user.id, 'design', d.id, 'create');
    return plain(d);
  });

  app.put('/api/designs/:id', async (req) => {
    const { id } = req.params as any;
    if (!(await prisma.design.findFirst({ where: { id, userId: req.user.id, deletedAt: null } }))) throw notFound('Проект');
    const b = z.object({ title: z.string().trim().min(1).max(200), params: paramsSchema }).parse(req.body);
    return plain(await prisma.design.update({ where: { id }, data: b }));
  });

  app.delete('/api/designs/:id', async (req) => {
    const { id } = req.params as any;
    if (!(await prisma.design.findFirst({ where: { id, userId: req.user.id, deletedAt: null } }))) throw notFound('Проект');
    await prisma.design.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  // ---- 3D для заказчика: ссылка без входа в Telegram ----
  const own = async (userId: string, id: string) => {
    const d = await prisma.design.findFirst({ where: { id, userId, deletedAt: null } });
    if (!d) throw notFound('Проект');
    return d;
  };
  const shareInfo = (d: any) => ({ url: d.shareToken ? viewUrl(d.shareToken) : null, sharedAt: d.sharedAt, viewedAt: d.viewedAt, estimateId: d.estimateId });

  app.post('/api/designs/:id/share', async (req) => {
    const d = await own(req.user.id, (req.params as any).id);
    if (!d.shareToken && !(await cleanProject(req.user, d.id))) throw new HttpError(402, `3D-ссылка для заказчика входит в 3D-проект. ${projectOffer(req.user)}`, 'design_required', d.id);
    const upd = d.shareToken ? d : await prisma.design.update({ where: { id: d.id }, data: { shareToken: newToken(), sharedAt: new Date(), viewedAt: null } });
    await audit(req.user.id, 'design', d.id, 'share');
    return shareInfo(upd);
  });
  app.delete('/api/designs/:id/share', async (req) => {
    const d = await own(req.user.id, (req.params as any).id);
    return shareInfo(await prisma.design.update({ where: { id: d.id }, data: { shareToken: null } }));
  });
  // проект добавлен в смету — у сметы для заказчика появится кнопка «Посмотреть в 3D»
  app.post('/api/designs/:id/link', async (req) => {
    const d = await own(req.user.id, (req.params as any).id);
    const { estimateId } = z.object({ estimateId: z.string().min(1).max(64) }).parse(req.body);
    await loadEstimate(req.user.id, estimateId);
    const share = premiumUser(req.user) || Boolean(d.paidAt); // 3D-кнопка в смете для заказчика — если проект оплачен
    const upd = await prisma.design.update({ where: { id: d.id }, data: { estimateId, ...(d.shareToken || !share ? {} : { shareToken: newToken(), sharedAt: new Date() }) } });
    return shareInfo(upd);
  });

  app.get('/v/:token', async (req, reply) => {
    const d = await byToken((req.params as any).token);
    reply.header('Content-Type', 'text/html; charset=utf-8').header('X-Robots-Tag', 'noindex').header('Referrer-Policy', 'no-referrer');
    const tpl = await viewerHtml();
    if (!d || !tpl) return reply.status(404).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Проект недоступен</title><body style="font:16px system-ui;padding:24px;background:#f4f1ea"><h1>Проект недоступен</h1><p>Ссылка устарела или исполнитель её отозвал. Попросите прислать новую.</p></body>`);
    if (!d.viewedAt) {
      const first = await prisma.design.updateMany({ where: { id: d.id, viewedAt: null }, data: { viewedAt: new Date() } });
      if (first.count && opts.bot) await opts.bot.api.sendMessage(Number(d.user.tgId), `👀 Заказчик открыл 3D-проект «${escHtml(d.title)}».`, { parse_mode: 'HTML' }).catch(() => {});
    }
    const u: any = d.user;
    let estimateUrl: string | null = null;
    if (d.estimateId) {
      const e = await prisma.estimate.findFirst({ where: { id: d.estimateId, userId: d.userId, deletedAt: null }, select: { shareToken: true } });
      if (e?.shareToken) estimateUrl = `/s/${e.shareToken}`;
    }
    const data = {
      title: d.title, kind: (d.params as any)?.kind === 'fence' ? 'Забор и ворота' : (d.params as any)?.kind === 'site' ? 'План участка' : (d.params as any)?.kind === 'mep' ? 'Электрика и сантехника' : OBJ_LABEL[(d.params as any)?.kind as keyof typeof OBJ_LABEL] || 'Проект', params: d.params,
      company: u.companyName || u.firstName || '', contacts: u.contacts || null,
      username: u.username || null, logo: brandPath(u.logoFile) ? `/v/${d.shareToken}/logo` : null,
      estimateUrl, botUrl: botLink('view3d'), date: d.updatedAt, hideBrand: can(accessOf(u).tier, 'whiteLabel'),
    };
    const html = tpl.replace('<!--DESIGN_DATA-->', () => `<script>window.__DESIGN__=${escJson(data)}</script>`).replace(/<title>[^<]*<\/title>/, () => `<title>${escHtml(d.title)} — 3D-проект</title>`);
    return reply.send(html);
  });
  app.get('/v/:token/logo', async (req, reply) => {
    const d = await byToken((req.params as any).token);
    const p = d && brandPath(d.user.logoFile);
    if (!p) return reply.status(404).send();
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=3600').send(await fsp.readFile(p));
  });

  // Описание словами → параметры (ИИ только заполняет параметры; чертежи и материалы считает программа)
  app.post('/api/designer/parse', async (req) => {
    const { text, params } = z.object({ text: z.string().trim().min(3).max(3000), params: paramsSchema.optional() }).parse(req.body);
    if (!aiConfigured()) throw new HttpError(503, 'ИИ ещё не подключён на сервере — заполните параметры вручную, чертежи и расчёт работают и без ИИ.', 'ai_unavailable');
    await useAi(req.user);
    const ai: any = await chatJson([{ role: 'system', content: CANOPY_AI_PROMPT }, { role: 'user', content: text }], CANOPY_AI_SCHEMA);
    const merged = mergeAiParams({ ...CANOPY_DEFAULT, ...(params || {}) } as any, ai);
    return { params: merged, title: ai.title || 'Навес', questions: Array.isArray(ai.questions) ? ai.questions.slice(0, 3) : [] };
  });

  // PDF «Эскизный проект» в чат бота
  app.post('/api/designer/pdf/send', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const b = z.object({ title: z.string().trim().min(1).max(200), params: paramsSchema, lines: z.array(lineSchema).max(500).optional(), designId: z.string().max(64).optional() }).parse(req.body);
    if (!opts.bot) throw new HttpError(503, 'Бот не подключён — отправить файл в чат нельзя', 'bot_not_configured');
    const mode = await designPdfMode(req.user, b.designId);
    const r = buildDesign(b.params as any, (req.user as any).designPrices || null);
    const u: any = req.user;
    const data = designPdfData(r, {
      title: b.title, company: u.companyName || [u.firstName, u.username ? `@${u.username}` : ''].filter(Boolean).join(' '),
      logoPath: brandPath(u.logoFile), freeMark: mode === 'draft', lines: b.lines,
    });
    if (data.freeMark) (data as any).bot = botInfo.username;
    const pdf = await renderDesign(data);
    const { InputFile } = await import('grammy');
    await opts.bot.api.sendDocument(Number(u.tgId), new InputFile(pdf, fileName(`Эскизный проект — ${b.title}`, 'pdf')), {
      caption: `Эскизный проект «${b.title}»: ${designKindOf(b.params) === 'site' ? '3D участка, генплан с расстояниями по нормам, схема сетей' : designKindOf(b.params) === 'mep' ? '3D в разрезе, план электрики, схема щита, план сантехники' : designKindOf(b.params) === 'fence' ? '3D, фасад, план участка, узлы, раскрой металла' : '3D, план, фасады, разрез основания, раскрой металла'} и ведомость. Всего ≈ ${data.total.toLocaleString('ru-RU')} ₽.`,
    });
    await audit(u.id, 'design', b.designId || '-', mode === 'draft' ? 'pdf_draft' : 'pdf_sent', { title: b.title });
    if (mode === 'draft') await opts.bot.api.sendMessage(Number(u.tgId), `Это черновой PDF с водяным знаком — для себя. ${projectOffer(u)}\n💡 Включите 3D-проект в смету заказчику отдельной строкой — обычно это 3–5 тыс. ₽.`).catch(() => {});
    return { ok: true, mode };
  });
}
