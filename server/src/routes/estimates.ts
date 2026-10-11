import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, plain, notFound, audit, num, HttpError } from '../util';
import { calcEstimate } from '../../../shared/estimate';
import { pdfData, renderPdf, pdfLink, checkPdfSig, pdfFileName } from '../pdf';
import { STARTER_PRICES } from '../../../shared/starterPrices';
import { getTemplate } from '../../../shared/templates';

const STATUSES = ['draft', 'sent', 'approved', 'rejected', 'archived'] as const;
const nonneg = z.coerce.number().min(0, 'не может быть отрицательным');
const pct = z.coerce.number().min(0).max(1000);

const lineSchema = z.object({
  id: z.string().optional(),
  category: z.string().max(100).nullable().optional(),
  name: z.string().trim().min(1, 'введите название позиции').max(300),
  type: z.enum(['work', 'material', 'equipment', 'service', 'other']).default('work'),
  unit: z.string().trim().min(1).max(30),
  qty: nonneg.max(1e9),
  price: nonneg.max(1e11),
  costPrice: nonneg.max(1e11).nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  unconfirmed: z.boolean().optional(),
});

const headerSchema = z.object({
  title: z.string().trim().min(1, 'введите название').max(200),
  customer: z.string().max(200).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  date: z.coerce.date().optional(),
  status: z.enum(STATUSES).optional(),
  projectId: z.string().nullable().optional(),
  discountPct: pct.optional(), markupPct: pct.optional(), taxPct: pct.optional(), lossReservePct: pct.optional(),
  delivery: nonneg.optional(), extraCosts: nonneg.optional(),
  notes: z.string().max(5000).nullable().optional(),
  paymentTerms: z.string().max(2000).nullable().optional(),
  validDays: z.coerce.number().int().min(1).max(365).optional(),
});

export function estimateTotals(e: any) {
  return calcEstimate(
    (e.lines || []).map((l: any) => ({ qty: num(l.qty), price: num(l.price), costPrice: l.costPrice == null ? null : num(l.costPrice), type: l.type, category: l.category })),
    { discountPct: num(e.discountPct), markupPct: num(e.markupPct), taxPct: num(e.taxPct), lossReservePct: num(e.lossReservePct), delivery: num(e.delivery), extraCosts: num(e.extraCosts) },
  );
}

const view = (e: any) => ({ ...plain(e), totals: estimateTotals(e) });

export async function loadEstimate(userId: string, id: string) {
  const e = await prisma.estimate.findFirst({ where: { id, userId, deletedAt: null }, include: { lines: { orderBy: { position: 'asc' } }, project: { select: { id: true, name: true } } } });
  if (!e) throw notFound('Смета');
  return e;
}

async function checkProject(userId: string, projectId?: string | null) {
  if (!projectId) return;
  const p = await prisma.project.findFirst({ where: { id: projectId, userId, deletedAt: null } });
  if (!p) throw notFound('Объект');
}

async function cloneEstimate(userId: string, src: any, overrides: any) {
  const { id, createdAt, updatedAt, lines, project, ...rest } = src;
  return prisma.estimate.create({
    data: {
      ...rest, ...overrides, userId,
      lines: { create: lines.map(({ id: _i, estimateId: _e, ...l }: any) => l) },
    },
    include: { lines: { orderBy: { position: 'asc' } } },
  });
}

/** Цены для строк шаблона: свой справочник → примерные цены на работы → 0 (заполнить вручную) */
async function priceTemplateLines(userId: string, lines: { name: string; qty: number; unit: string; type: string; category: string }[]) {
  const items = await prisma.catalogItem.findMany({ where: { userId, deletedAt: null, active: true } });
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const starter = new Map(STARTER_PRICES.map((p) => [p.name.toLowerCase(), p]));
  return lines.map((l, i) => {
    const own = byName.get(l.name.toLowerCase());
    const st = starter.get(l.name.toLowerCase());
    const note = own ? null : st ? 'Примерная цена — проверьте' : 'Укажите цену';
    return {
      position: i, name: l.name, qty: l.qty, unit: own?.unit || l.unit, type: l.type, category: l.category,
      price: own ? own.price : st ? st.price : 0, costPrice: own?.costPrice ?? null, catalogItemId: own?.id ?? null,
      note: note ? `${note}; количество типовое — уточните` : 'Количество типовое — уточните', unconfirmed: true,
    };
  });
}

async function estimateNumber(userId: string, e: any) {
  return prisma.estimate.count({ where: { userId, isTemplate: false, createdAt: { lte: e.createdAt } } });
}

export async function estimateRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  app.get('/api/templates', async () => (await import('../../../shared/templates')).TEMPLATES.map((t) => ({ id: t.id, title: t.title, description: t.description, lines: t.lines.length })));

  // ---- PDF ----
  app.post('/api/estimates/:id/pdf/send', async (req) => {
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    if (!opts.bot) throw new HttpError(503, 'Бот не подключён — отправить PDF в чат нельзя', 'bot_not_configured');
    const pdf = await renderPdf(pdfData(e, req.user, await estimateNumber(req.user.id, e)));
    const { InputFile } = await import('grammy');
    await opts.bot.api.sendDocument(Number(req.user.tgId), new InputFile(pdf, pdfFileName(e.title)), {
      caption: `Смета «${e.title}» — ${estimateTotals(e).total.toLocaleString('ru-RU')} ₽. Перешлите заказчику.`,
    });
    await audit(req.user.id, 'estimate', e.id, 'pdf_sent');
    return { ok: true };
  });

  app.get('/api/estimates/:id/pdf/link', async (req) => {
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    return { url: pdfLink(e.id) };
  });

  app.get('/files/estimates/:file', async (req, reply) => {
    const id = String((req.params as any).file).replace(/\.pdf$/, '');
    const { exp, sig } = req.query as any;
    if (!checkPdfSig(id, exp, sig)) return reply.status(403).send({ error: 'Ссылка устарела, откройте PDF из приложения заново' });
    const e = await prisma.estimate.findFirst({ where: { id, deletedAt: null }, include: { lines: { orderBy: { position: 'asc' } }, user: true } });
    if (!e) return reply.status(404).send({ error: 'Смета не найдена' });
    const pdf = await renderPdf(pdfData(e, e.user, await estimateNumber(e.userId, e)));
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(pdfFileName(e.title))}`).send(pdf);
  });

  app.get('/api/estimates', async (req) => {
    const q = z.object({
      q: z.string().optional(), status: z.string().optional(), template: z.string().optional(),
      from: z.coerce.date().optional(), to: z.coerce.date().optional(), projectId: z.string().optional(),
    }).parse(req.query);
    const list = await prisma.estimate.findMany({
      where: {
        userId: req.user.id, deletedAt: null, isTemplate: q.template === '1',
        ...(q.status ? { status: q.status } : {}),
        ...(q.projectId ? { projectId: q.projectId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
        ...(q.q ? { OR: [
          { title: { contains: q.q, mode: 'insensitive' as const } },
          { customer: { contains: q.q, mode: 'insensitive' as const } },
          { lines: { some: { name: { contains: q.q, mode: 'insensitive' as const } } } },
        ] } : {}),
      },
      include: { lines: true, project: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' }, take: 300,
    });
    return list.map((e) => {
      const t = estimateTotals(e);
      const { lines, ...rest } = plain(e);
      return { ...rest, linesCount: e.lines.length, total: t.total, plannedProfit: t.plannedProfit };
    });
  });

  app.post('/api/estimates', async (req) => {
    const body = headerSchema.partial({ title: true }).extend({ fromId: z.string().optional(), templateId: z.string().optional() }).parse(req.body);
    await checkProject(req.user.id, body.projectId);
    if (body.templateId) {
      const tpl = getTemplate(body.templateId);
      if (!tpl) throw notFound('Шаблон');
      const e = await prisma.estimate.create({
        data: {
          userId: req.user.id, title: body.title || tpl.title, projectId: body.projectId || null, customer: body.customer || null,
          lines: { create: await priceTemplateLines(req.user.id, tpl.lines) },
        },
        include: { lines: { orderBy: { position: 'asc' } } },
      });
      await audit(req.user.id, 'estimate', e.id, 'create', { template: tpl.id });
      return view(e);
    }
    if (body.fromId) {
      // создать из шаблона или копии другой сметы
      const src = await loadEstimate(req.user.id, body.fromId);
      const e = await cloneEstimate(req.user.id, src, {
        title: body.title || (src.isTemplate ? src.title : `${src.title} (копия)`),
        isTemplate: false, status: 'draft', date: new Date(), projectId: body.projectId ?? (src.isTemplate ? null : src.projectId),
        customer: body.customer ?? (src.isTemplate ? null : src.customer), source: 'manual',
      });
      await audit(req.user.id, 'estimate', e.id, 'create', { fromId: src.id });
      return view(e);
    }
    const { fromId, ...data } = body;
    const e = await prisma.estimate.create({ data: { ...data, title: data.title || 'Новая смета', userId: req.user.id }, include: { lines: true } });
    await audit(req.user.id, 'estimate', e.id, 'create');
    return view(e);
  });

  app.get('/api/estimates/:id', async (req) => view(await loadEstimate(req.user.id, (req.params as any).id)));

  // Полное сохранение (шапка + строки). Используется автосохранением редактора.
  app.put('/api/estimates/:id', async (req) => {
    const { id } = req.params as any;
    const prev = await loadEstimate(req.user.id, id);
    const body = headerSchema.extend({ lines: z.array(lineSchema).max(2000) }).parse(req.body);
    await checkProject(req.user.id, body.projectId);
    const prevTotal = estimateTotals(prev).total;
    const { lines, ...header } = body;
    await prisma.$transaction([
      prisma.estimateLine.deleteMany({ where: { estimateId: id } }),
      prisma.estimate.update({
        where: { id },
        data: {
          ...header,
          lines: { create: lines.map(({ id: _i, ...l }, i) => ({ ...l, position: i })) },
        },
      }),
    ]);
    const saved = await loadEstimate(req.user.id, id);
    const t = estimateTotals(saved);
    if (t.total !== prevTotal || prev.lines.length !== saved.lines.length || prev.status !== saved.status) {
      await audit(req.user.id, 'estimate', id, 'update', { totalBefore: prevTotal, totalAfter: t.total, lines: saved.lines.length, status: saved.status });
    }
    return { ...plain(saved), totals: t };
  });

  // Добавить строки (из калькулятора, справочника)
  app.post('/api/estimates/:id/lines', async (req) => {
    const { id } = req.params as any;
    const e = await loadEstimate(req.user.id, id);
    const { lines } = z.object({ lines: z.array(lineSchema).min(1).max(200) }).parse(req.body);
    const start = e.lines.length;
    await prisma.estimateLine.createMany({ data: lines.map(({ id: _i, ...l }, i) => ({ ...l, estimateId: id, position: start + i })) });
    await prisma.estimate.update({ where: { id }, data: { updatedAt: new Date() } });
    await audit(req.user.id, 'estimate', id, 'add_lines', { count: lines.length });
    return view(await loadEstimate(req.user.id, id));
  });

  app.post('/api/estimates/:id/duplicate', async (req) => {
    const src = await loadEstimate(req.user.id, (req.params as any).id);
    const e = await cloneEstimate(req.user.id, src, { title: `${src.title} (копия)`, status: 'draft', date: new Date() });
    await audit(req.user.id, 'estimate', e.id, 'create', { duplicateOf: src.id });
    return view(e);
  });

  app.post('/api/estimates/:id/save-as-template', async (req) => {
    const src = await loadEstimate(req.user.id, (req.params as any).id);
    const { title } = z.object({ title: z.string().trim().min(1).max(200).optional() }).parse(req.body || {});
    const e = await cloneEstimate(req.user.id, src, { title: title || src.title, isTemplate: true, projectId: null, customer: null, address: null, status: 'draft' });
    return view(e);
  });

  // Ручное обновление цен из справочника (только выбранные строки или все связанные)
  app.post('/api/estimates/:id/refresh-prices', async (req) => {
    const { id } = req.params as any;
    const e = await loadEstimate(req.user.id, id);
    const { lineIds } = z.object({ lineIds: z.array(z.string()).optional() }).parse(req.body || {});
    const targets = e.lines.filter((l) => l.catalogItemId && (!lineIds || lineIds.includes(l.id)));
    const items = await prisma.catalogItem.findMany({ where: { id: { in: targets.map((l) => l.catalogItemId!) }, userId: req.user.id, deletedAt: null } });
    const byId = new Map(items.map((i) => [i.id, i]));
    let changed = 0;
    for (const l of targets) {
      const it = byId.get(l.catalogItemId!);
      if (!it) continue;
      if (num(it.price) !== num(l.price) || num(it.costPrice) !== num(l.costPrice)) {
        await prisma.estimateLine.update({ where: { id: l.id }, data: { price: it.price, costPrice: it.costPrice } });
        changed++;
      }
    }
    if (changed) await audit(req.user.id, 'estimate', id, 'refresh_prices', { changed });
    return { ...view(await loadEstimate(req.user.id, id)), changed };
  });

  app.delete('/api/estimates/:id', async (req) => {
    const { id } = req.params as any;
    await loadEstimate(req.user.id, id);
    await prisma.estimate.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(req.user.id, 'estimate', id, 'delete');
    return { ok: true };
  });

  app.post('/api/estimates/:id/restore', async (req) => {
    const { id } = req.params as any;
    const e = await prisma.estimate.findFirst({ where: { id, userId: req.user.id } });
    if (!e) throw notFound('Смета');
    if (!e.deletedAt) throw new HttpError(400, 'Смета не удалена');
    await prisma.estimate.update({ where: { id }, data: { deletedAt: null } });
    await audit(req.user.id, 'estimate', id, 'restore');
    return { ok: true };
  });

  app.get('/api/estimates/:id/history', async (req) => {
    const { id } = req.params as any;
    await loadEstimate(req.user.id, id);
    return plain(await prisma.auditLog.findMany({ where: { userId: req.user.id, entity: 'estimate', entityId: id }, orderBy: { createdAt: 'desc' }, take: 100 }));
  });
}
