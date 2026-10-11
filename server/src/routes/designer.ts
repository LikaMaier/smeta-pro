import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { prisma, plain, notFound, HttpError, accessOf, audit } from '../util';
import { buildCanopy, CANOPY_DEFAULT } from '../../../shared/design/canopy';
import { designPdfData } from '../../../shared/design/report';
import { CANOPY_AI_SCHEMA, CANOPY_AI_PROMPT, mergeAiParams } from '../../../shared/design/ai';
import { chatJson } from '../ai/openai';
import { renderDesign, fileName } from '../pdf';
import { brandPath } from '../brand';

/** ИИ-проектировщик: проекты (параметры модели), разбор описания ИИ, PDF «Эскизный проект» */
const paramsSchema = z.record(z.string(), z.any());
const lineSchema = z.object({ name: z.string().max(300), qty: z.coerce.number().min(0), unit: z.string().max(30), price: z.coerce.number().min(0), type: z.string().max(20) });

export async function designerRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  app.get('/api/designs', async (req) => plain(await prisma.design.findMany({ where: { userId: req.user.id, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: 100 })));

  app.post('/api/designs', async (req) => {
    const b = z.object({ title: z.string().trim().min(1).max(200), params: paramsSchema, kind: z.string().default('canopy') }).parse(req.body);
    const d = await prisma.design.create({ data: { userId: req.user.id, title: b.title, params: b.params, kind: b.kind } });
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

  // Описание словами → параметры (ИИ только заполняет параметры; чертежи и материалы считает программа)
  app.post('/api/designer/parse', async (req) => {
    const { text, params } = z.object({ text: z.string().trim().min(3).max(3000), params: paramsSchema.optional() }).parse(req.body);
    if (!env.OPENAI_API_KEY) throw new HttpError(503, 'ИИ ещё не подключён на сервере — заполните параметры вручную, чертежи и расчёт работают и без ИИ.', 'ai_unavailable');
    const ai: any = await chatJson([{ role: 'system', content: CANOPY_AI_PROMPT }, { role: 'user', content: text }], CANOPY_AI_SCHEMA);
    const merged = mergeAiParams({ ...CANOPY_DEFAULT, ...(params || {}) } as any, ai);
    return { params: merged, title: ai.title || 'Навес', questions: Array.isArray(ai.questions) ? ai.questions.slice(0, 3) : [] };
  });

  // PDF «Эскизный проект» в чат бота
  app.post('/api/designer/pdf/send', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const b = z.object({ title: z.string().trim().min(1).max(200), params: paramsSchema, lines: z.array(lineSchema).max(500).optional() }).parse(req.body);
    if (!opts.bot) throw new HttpError(503, 'Бот не подключён — отправить файл в чат нельзя', 'bot_not_configured');
    const r = buildCanopy(b.params as any);
    const u: any = req.user;
    const data = designPdfData(r, {
      title: b.title, company: u.companyName || [u.firstName, u.username ? `@${u.username}` : ''].filter(Boolean).join(' '),
      logoPath: brandPath(u.logoFile), freeMark: !accessOf(u).active, lines: b.lines,
    });
    const pdf = await renderDesign(data);
    const { InputFile } = await import('grammy');
    await opts.bot.api.sendDocument(Number(u.tgId), new InputFile(pdf, fileName(`Эскизный проект — ${b.title}`, 'pdf')), {
      caption: `Эскизный проект «${b.title}»: 3D, план, фасады, разрез основания, раскрой металла и ведомость материалов. Всего ≈ ${data.total.toLocaleString('ru-RU')} ₽.`,
    });
    await audit(u.id, 'design', '-', 'pdf_sent', { title: b.title });
    return { ok: true };
  });
}
