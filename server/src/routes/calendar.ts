import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';
import { prisma, plain, notFound, HttpError, num } from '../util';
import { summarize, byMonth } from '../../../shared/calendar';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const MAX_PHOTO = 4 * 1024 * 1024; // после сжатия на телефоне обычно 200–600 КБ

export const PHOTO_DIR = path.resolve(process.env.PHOTO_DIR || './data/photos');
const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

/** Подписанная ссылка на файл фото: <img> не может передать заголовок авторизации */
function signedUrl(id: string, variant: 'full' | 'thumb', ttlSec = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET || 'dev-secret').update(`${id}:${variant}:${exp}`).digest('base64url');
  return `/files/photos/${id}/${variant}?exp=${exp}&sig=${sig}`;
}
function checkSig(id: string, variant: string, exp: string, sig: string) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET || 'dev-secret').update(`${id}:${variant}:${exp}`).digest('base64url');
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function decodeJpeg(dataUrl: string, what: string): Buffer {
  const m = /^data:image\/(jpeg|jpg|webp|png);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, `Неверный формат ${what}`);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_PHOTO) throw new HttpError(413, 'Фото слишком большое');
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isWebp = buf.slice(8, 12).toString() === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw new HttpError(400, 'Файл не похож на изображение');
  return buf;
}

const photoView = (p: any) => ({
  id: p.id, date: p.date, caption: p.caption, projectId: p.projectId, project: p.project ? { id: p.project.id, name: p.project.name } : null,
  createdAt: p.createdAt, url: signedUrl(p.id, 'full'), thumbUrl: signedUrl(p.id, 'thumb'),
});

async function ownProject(userId: string, projectId?: string | null) {
  if (!projectId) return;
  if (!(await prisma.project.findFirst({ where: { id: projectId, userId, deletedAt: null } }))) throw notFound('Объект');
}

export async function calendarRoutes(app: FastifyInstance) {
  await fs.mkdir(PHOTO_DIR, { recursive: true }).catch((e) => app.log.error({ err: e }, 'Нет доступа к папке фото'));

  // ---- Месяц: отметки по дням и итоги ----
  app.get('/api/calendar', async (req) => {
    const { month, projectId } = z.object({ month: z.string().regex(MONTH), projectId: z.string().optional() }).parse(req.query);
    const from = dayDate(`${month}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const yearFrom = new Date(Date.UTC(from.getUTCFullYear(), 0, 1));
    const yearTo = new Date(Date.UTC(from.getUTCFullYear() + 1, 0, 1));
    const where = { userId: req.user.id, deletedAt: null, ...(projectId ? { projectId } : {}) };
    const [ops, photos, logs, projects] = await Promise.all([
      prisma.financeOp.findMany({ where: { ...where, date: { gte: yearFrom, lt: yearTo }, project: { deletedAt: null } }, select: { kind: true, incomeType: true, amount: true, paidAmount: true, date: true, projectId: true } }),
      prisma.photo.groupBy({ by: ['date'], where: { ...where, date: { gte: from, lt: to } }, _count: true }),
      prisma.workLog.groupBy({ by: ['date'], where: { ...where, date: { gte: from, lt: to } }, _count: true }),
      prisma.project.findMany({ where: { userId: req.user.id, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    const all = ops.map((o) => ({ ...o, amount: num(o.amount), paidAmount: num(o.paidAmount) }));
    const monthOps = all.filter((o) => o.date >= from && o.date < to);
    const s = summarize(monthOps);
    const year = summarize(all);
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const days: Record<string, any> = {};
    const touch = (k: string) => (days[k] ||= { photos: 0, logs: 0, received: 0, spent: 0, earned: 0 });
    photos.forEach((p) => (touch(p.date.toISOString().slice(0, 10)).photos = p._count));
    logs.forEach((l) => (touch(l.date.toISOString().slice(0, 10)).logs = l._count));
    Object.entries(s.days).forEach(([k, t]) => Object.assign(touch(k), t));
    return {
      month, days, total: s.total,
      projects: Object.entries(s.projects).map(([id, t]) => ({ id, name: names.get(id) || 'Без объекта', ...t })).sort((a, b) => b.earned - a.earned),
      year: { total: year.total, months: byMonth(all, from.getUTCFullYear()) },
    };
  });

  // ---- День: фото, записи, деньги ----
  app.get('/api/calendar/day', async (req) => {
    const { date, projectId } = z.object({ date: z.string().regex(DAY), projectId: z.string().optional() }).parse(req.query);
    const d = dayDate(date);
    const where = { userId: req.user.id, deletedAt: null, date: d, ...(projectId ? { projectId } : {}) };
    const proj = { select: { id: true, name: true } };
    const [photos, logs, ops] = await Promise.all([
      prisma.photo.findMany({ where, include: { project: proj }, orderBy: { createdAt: 'asc' } }),
      prisma.workLog.findMany({ where, include: { project: proj }, orderBy: { createdAt: 'asc' } }),
      prisma.financeOp.findMany({ where: { ...where, project: { deletedAt: null } }, include: { project: proj }, orderBy: { createdAt: 'asc' } }),
    ]);
    const s = summarize(ops.map((o) => ({ ...o, amount: num(o.amount), paidAmount: num(o.paidAmount) })));
    return { date, photos: photos.map(photoView), logs: plain(logs), ops: plain(ops), total: s.total };
  });

  // ---- Фото объекта ----
  app.get('/api/photos', async (req) => {
    const { projectId } = z.object({ projectId: z.string() }).parse(req.query);
    await ownProject(req.user.id, projectId);
    const list = await prisma.photo.findMany({ where: { userId: req.user.id, projectId, deletedAt: null }, include: { project: { select: { id: true, name: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500 });
    return list.map(photoView);
  });

  app.post('/api/photos', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const body = z.object({
      date: z.string().regex(DAY), projectId: z.string().nullable().optional(), caption: z.string().max(500).nullable().optional(),
      image: z.string().min(20), thumb: z.string().min(20),
    }).parse(req.body);
    await ownProject(req.user.id, body.projectId);
    const full = decodeJpeg(body.image, 'фото');
    const small = decodeJpeg(body.thumb, 'миниатюры');
    const id = crypto.randomUUID();
    const dir = path.join(PHOTO_DIR, req.user.id);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(req.user.id, `${id}.jpg`);
    const thumb = path.join(req.user.id, `${id}_t.jpg`);
    await fs.writeFile(path.join(PHOTO_DIR, file), full);
    await fs.writeFile(path.join(PHOTO_DIR, thumb), small);
    const p = await prisma.photo.create({
      data: { userId: req.user.id, projectId: body.projectId || null, date: dayDate(body.date), caption: body.caption || null, file, thumb, size: full.length },
      include: { project: { select: { id: true, name: true } } },
    });
    return photoView(p);
  });

  app.patch('/api/photos/:id', async (req) => {
    const { id } = req.params as any;
    const prev = await prisma.photo.findFirst({ where: { id, userId: req.user.id, deletedAt: null } });
    if (!prev) throw notFound('Фото');
    const body = z.object({ caption: z.string().max(500).nullable().optional(), projectId: z.string().nullable().optional(), date: z.string().regex(DAY).optional() }).parse(req.body);
    await ownProject(req.user.id, body.projectId);
    const p = await prisma.photo.update({ where: { id }, data: { caption: body.caption, projectId: body.projectId, ...(body.date ? { date: dayDate(body.date) } : {}) }, include: { project: { select: { id: true, name: true } } } });
    return photoView(p);
  });

  app.delete('/api/photos/:id', async (req) => {
    const { id } = req.params as any;
    const p = await prisma.photo.findFirst({ where: { id, userId: req.user.id, deletedAt: null } });
    if (!p) throw notFound('Фото');
    await prisma.photo.update({ where: { id }, data: { deletedAt: new Date() } });
    await Promise.all([fs.rm(path.join(PHOTO_DIR, p.file), { force: true }), fs.rm(path.join(PHOTO_DIR, p.thumb), { force: true })]);
    return { ok: true };
  });

  // Файлы — по подписанной ссылке, без заголовка авторизации
  app.get('/files/photos/:id/:variant', async (req, reply) => {
    const { id, variant } = req.params as any;
    const { exp, sig } = req.query as any;
    if (!['full', 'thumb'].includes(variant) || !checkSig(id, variant, exp, sig)) return reply.status(403).send({ error: 'Ссылка устарела' });
    const p = await prisma.photo.findFirst({ where: { id, deletedAt: null } });
    if (!p) return reply.status(404).send({ error: 'Фото не найдено' });
    try {
      const buf = await fs.readFile(path.join(PHOTO_DIR, variant === 'thumb' ? p.thumb : p.file));
      return reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=21600').send(buf);
    } catch {
      return reply.status(404).send({ error: 'Файл фото не найден на диске' });
    }
  });

  // ---- Журнал работ ----
  const logSchema = z.object({ date: z.string().regex(DAY), projectId: z.string().nullable().optional(), text: z.string().trim().min(1, 'введите текст').max(5000) });
  app.post('/api/worklogs', async (req) => {
    const b = logSchema.parse(req.body);
    await ownProject(req.user.id, b.projectId);
    return plain(await prisma.workLog.create({ data: { userId: req.user.id, projectId: b.projectId || null, date: dayDate(b.date), text: b.text } }));
  });
  app.patch('/api/worklogs/:id', async (req) => {
    const { id } = req.params as any;
    if (!(await prisma.workLog.findFirst({ where: { id, userId: req.user.id, deletedAt: null } }))) throw notFound('Запись');
    const b = logSchema.partial().parse(req.body);
    await ownProject(req.user.id, b.projectId);
    return plain(await prisma.workLog.update({ where: { id }, data: { text: b.text, projectId: b.projectId, ...(b.date ? { date: dayDate(b.date) } : {}) } }));
  });
  app.delete('/api/worklogs/:id', async (req) => {
    const { id } = req.params as any;
    if (!(await prisma.workLog.findFirst({ where: { id, userId: req.user.id, deletedAt: null } }))) throw notFound('Запись');
    await prisma.workLog.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}
