import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, plain, notFound } from '../util';
import { nextRun } from '../../../shared/reminders';

const REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const;
const CONTACT_CATS = ['customer', 'equipment', 'supplier', 'worker', 'other'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function ownProject(userId: string, projectId?: string | null) {
  if (projectId && !(await prisma.project.findFirst({ where: { id: projectId, userId, deletedAt: null } }))) throw notFound('Объект');
}

export async function organizerRoutes(app: FastifyInstance) {
  // ---------- Напоминания ----------
  const remSchema = z.object({
    text: z.string().trim().min(1, 'напишите, о чём напомнить').max(1000),
    remindAt: z.coerce.date(),
    repeat: z.enum(REPEATS).default('none'),
    projectId: z.string().nullable().optional(),
    active: z.boolean().optional(),
  });
  const ownRem = async (userId: string, id: string) => {
    const r = await prisma.reminder.findFirst({ where: { id, userId, deletedAt: null } });
    if (!r) throw notFound('Напоминание');
    return r;
  };

  app.get('/api/reminders', async (req) => plain(await prisma.reminder.findMany({
    where: { userId: req.user.id, deletedAt: null }, include: { project: { select: { id: true, name: true } } },
    orderBy: [{ active: 'desc' }, { remindAt: 'asc' }], take: 300,
  })));

  app.post('/api/reminders', async (req) => {
    const b = remSchema.parse(req.body);
    await ownProject(req.user.id, b.projectId);
    // время в прошлом для повторяющегося — сдвигаем на ближайшее будущее
    const at = b.remindAt <= new Date() && b.repeat !== 'none' ? nextRun(b.remindAt, b.repeat)! : b.remindAt;
    return plain(await prisma.reminder.create({ data: { ...b, remindAt: at, projectId: b.projectId || null, userId: req.user.id, active: true } }));
  });

  app.patch('/api/reminders/:id', async (req) => {
    const { id } = req.params as any;
    await ownRem(req.user.id, id);
    const b = remSchema.partial().parse(req.body);
    await ownProject(req.user.id, b.projectId);
    let at = b.remindAt;
    if (at && at <= new Date() && b.repeat && b.repeat !== 'none') at = nextRun(at, b.repeat)!;
    return plain(await prisma.reminder.update({ where: { id }, data: { ...b, ...(at ? { remindAt: at } : {}) } }));
  });

  app.delete('/api/reminders/:id', async (req) => {
    const { id } = req.params as any;
    await ownRem(req.user.id, id);
    await prisma.reminder.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    return { ok: true };
  });

  // ---------- Записная книжка ----------
  const conSchema = z.object({
    name: z.string().trim().min(1, 'введите имя или название').max(200),
    phone: z.string().trim().max(40).nullable().optional(),
    category: z.enum(CONTACT_CATS).default('customer'),
    note: z.string().max(2000).nullable().optional(),
    date: z.string().regex(DAY),
    projectId: z.string().nullable().optional(),
  });
  app.get('/api/contacts', async (req) => {
    const q = z.object({ q: z.string().optional(), category: z.string().optional() }).parse(req.query);
    return plain(await prisma.contact.findMany({
      where: {
        userId: req.user.id, deletedAt: null, ...(q.category ? { category: q.category } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { phone: { contains: q.q } }, { note: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000,
    }));
  });
  app.post('/api/contacts', async (req) => {
    const b = conSchema.parse(req.body);
    await ownProject(req.user.id, b.projectId);
    return plain(await prisma.contact.create({ data: { ...b, projectId: b.projectId || null, date: new Date(`${b.date}T00:00:00.000Z`), userId: req.user.id } }));
  });
  app.patch('/api/contacts/:id', async (req) => {
    const { id } = req.params as any;
    if (!(await prisma.contact.findFirst({ where: { id, userId: req.user.id, deletedAt: null } }))) throw notFound('Контакт');
    const b = conSchema.partial().parse(req.body);
    await ownProject(req.user.id, b.projectId);
    return plain(await prisma.contact.update({ where: { id }, data: { ...b, ...(b.date ? { date: new Date(`${b.date}T00:00:00.000Z`) } : {}) } }));
  });
  app.delete('/api/contacts/:id', async (req) => {
    const { id } = req.params as any;
    if (!(await prisma.contact.findFirst({ where: { id, userId: req.user.id, deletedAt: null } }))) throw notFound('Контакт');
    await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });
}

/** Планировщик: раз в 30 секунд отправляет наступившие напоминания в бот */
export function startReminderLoop(bot: any, log: { error: (o: any, m?: string) => void; info: (m: string) => void }, appUrl: string) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await prisma.reminder.findMany({
        where: { active: true, deletedAt: null, remindAt: { lte: new Date() } },
        include: { user: true, project: { select: { name: true } } }, take: 100,
      });
      for (const r of due) {
        const next = nextRun(r.remindAt, r.repeat);
        // «захват» записи: если другой процесс уже обработал — пропускаем
        const claimed = await prisma.reminder.updateMany({
          where: { id: r.id, remindAt: r.remindAt, active: true },
          data: next ? { remindAt: next, lastSentAt: new Date() } : { active: false, lastSentAt: new Date() },
        });
        if (!claimed.count) continue;
        try {
          await bot.api.sendMessage(Number(r.user.tgId), `⏰ <b>Напоминание</b>\n${escapeHtml(r.text)}${r.project ? `\nОбъект: ${escapeHtml(r.project.name)}` : ''}`, {
            parse_mode: 'HTML',
            ...(appUrl ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть СМЕТА PRO', web_app: { url: `${appUrl}/reminders` } }]] } } : {}),
          });
        } catch (e) { log.error({ err: e }, 'Не удалось отправить напоминание'); }
      }
    } catch (e) { log.error({ err: e }, 'Ошибка планировщика напоминаний'); } finally { running = false; }
  };
  setInterval(tick, 30000);
  setTimeout(tick, 5000);
  log.info('Планировщик напоминаний запущен');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
