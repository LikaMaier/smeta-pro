import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, plain, notFound, accessOf, num, HttpError } from '../util';
import { digestDue, lastWeek, digestText } from '../../../shared/digest';
import { summarize } from '../../../shared/calendar';
import { projectFinance } from './projects';
import { env } from '../env';
import { nextRun, preTime, REM_KINDS, kindOf, beforeText } from '../../../shared/reminders';

const REPEATS = ['none', 'daily', 'weekdays', 'days', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
const KINDS = REM_KINDS.map((k) => k.id) as [string, ...string[]];
const daysOf = (s?: string | null) => (s ? s.split(',').map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : []);
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
    kind: z.enum(KINDS).optional(),
    days: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
    tz: z.number().int().min(-720).max(840).optional(),
    before: z.number().int().min(0).max(43200).optional(),
  });
  /** Привести время к ближайшему подходящему и посчитать предупреждение «заранее» */
  const schedule = (at: Date, repeat: string, days: number[], tz: number, before: number) => {
    const now = new Date();
    // прошедшее время или неподходящий день недели — переносим на ближайший подходящий момент
    const t = repeat === 'none' ? at : nextRun(at, repeat, now, { days, tz }) || at;
    return { remindAt: t, preAt: preTime(t, before, now) };
  };
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
    const days = b.days || [];
    if (b.repeat === 'days' && !days.length) throw new HttpError(400, 'Выберите дни недели');
    const tz = b.tz ?? 180, before = b.before ?? 0;
    // время в прошлом для повторяющегося — сдвигаем на ближайшее будущее
    const sch = schedule(b.remindAt, b.repeat, days, tz, before);
    return plain(await prisma.reminder.create({ data: { text: b.text, repeat: b.repeat, kind: b.kind || 'other', days: days.join(',') || null, tz, before, ...sch, projectId: b.projectId || null, userId: req.user.id, active: true } }));
  });

  app.patch('/api/reminders/:id', async (req) => {
    const { id } = req.params as any;
    const cur = await ownRem(req.user.id, id);
    const b = remSchema.partial().parse(req.body);
    await ownProject(req.user.id, b.projectId);
    const repeat = b.repeat ?? cur.repeat, tz = b.tz ?? cur.tz, before = b.before ?? cur.before;
    const days = b.days !== undefined ? (b.days || []) : daysOf(cur.days);
    if (repeat === 'days' && !days.length) throw new HttpError(400, 'Выберите дни недели');
    const sch = schedule(b.remindAt ?? cur.remindAt, repeat, days, tz, before);
    const { days: _d, ...rest } = b;
    return plain(await prisma.reminder.update({ where: { id }, data: { ...rest, repeat, tz, before, days: days.join(',') || null, ...sch } }));
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
    const q = z.object({ q: z.string().optional(), category: z.string().optional(), projectId: z.string().optional() }).parse(req.query);
    return plain(await prisma.contact.findMany({
      where: {
        userId: req.user.id, deletedAt: null, ...(q.category ? { category: q.category } : {}), ...(q.projectId ? { projectId: q.projectId } : {}),
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

/** Кнопки под напоминанием: отложить, готово, открыть приложение */
export function remKeyboard(id: string, appUrl?: string) {
  return { inline_keyboard: [
    [{ text: '⏳ 15 мин', callback_data: `rem:15:${id}` }, { text: '⏳ 1 час', callback_data: `rem:60:${id}` }, { text: '⏳ 3 часа', callback_data: `rem:180:${id}` }],
    [{ text: '🌅 Завтра 9:00', callback_data: `rem:tom:${id}` }, { text: '✅ Готово', callback_data: `rem:ok:${id}` }],
    ...(appUrl ? [[{ text: 'Открыть СМЕТА PRO', web_app: { url: `${appUrl}/reminders` } }]] : []),
  ] };
}

/** Нажатие кнопки под напоминанием. Повторяющееся не сдвигаем — откладываем разовой копией. */
export async function remAction(tgId: number, action: string, id: string): Promise<string> {
  const r = await prisma.reminder.findFirst({ where: { id, deletedAt: null, user: { tgId: BigInt(tgId) } } });
  if (!r) return 'Напоминание не найдено';
  if (action === 'ok') return '✅ Отмечено';
  let at: Date;
  if (action === 'tom') {
    const local = new Date(Date.now() + r.tz * 60000);
    at = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 9, 0) - r.tz * 60000);
  } else at = new Date(Date.now() + Number(action) * 60000);
  if (r.repeat === 'none') await prisma.reminder.update({ where: { id }, data: { remindAt: at, active: true, preAt: null } });
  else await prisma.reminder.create({ data: { userId: r.userId, projectId: r.projectId, text: r.text, kind: r.kind, tz: r.tz, remindAt: at, repeat: 'none' } });
  const local = new Date(at.getTime() + r.tz * 60000).toLocaleString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `⏳ Напомню ${local}`;
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
        const next = nextRun(r.remindAt, r.repeat, new Date(), { days: daysOf(r.days), tz: r.tz });
        // «захват» записи: если другой процесс уже обработал — пропускаем
        const claimed = await prisma.reminder.updateMany({
          where: { id: r.id, remindAt: r.remindAt, active: true },
          data: next ? { remindAt: next, lastSentAt: new Date(), preAt: preTime(next, r.before) } : { active: false, lastSentAt: new Date(), preAt: null },
        });
        if (!claimed.count) continue;
        const k = kindOf(r.kind);
        try {
          await bot.api.sendMessage(Number(r.user.tgId), `${k.icon} <b>Напоминание</b>\n${escapeHtml(r.text)}${r.project ? `\nОбъект: ${escapeHtml(r.project.name)}` : ''}`, {
            parse_mode: 'HTML', reply_markup: remKeyboard(r.id, appUrl),
          });
        } catch (e) { log.error({ err: e }, 'Не удалось отправить напоминание'); }
      }
      // предупреждения «заранее»
      const pre = await prisma.reminder.findMany({
        where: { active: true, deletedAt: null, preAt: { lte: new Date() } },
        include: { user: true, project: { select: { name: true } } }, take: 100,
      });
      for (const r of pre) {
        const claimed = await prisma.reminder.updateMany({ where: { id: r.id, preAt: r.preAt }, data: { preAt: null } });
        if (!claimed.count || r.remindAt <= new Date()) continue;
        const k = kindOf(r.kind);
        const local = new Date(r.remindAt.getTime() + r.tz * 60000).toLocaleString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        try {
          await bot.api.sendMessage(Number(r.user.tgId), `🔔 <b>Заранее: ${beforeText(r.before)}</b> (${local})\n${k.icon} ${escapeHtml(r.text)}${r.project ? `\nОбъект: ${escapeHtml(r.project.name)}` : ''}`, {
            parse_mode: 'HTML', ...(appUrl ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть напоминания', web_app: { url: `${appUrl}/reminders` } }]] } } : {}),
          });
        } catch (e) { log.error({ err: e }, 'Не удалось отправить предупреждение'); }
      }
      await subscriptionNotices(bot, log, appUrl);
      await weeklyDigests(bot, log, appUrl);
    } catch (e) { log.error({ err: e }, 'Ошибка планировщика напоминаний'); } finally { running = false; }
  };
  setInterval(tick, 30000);
  setTimeout(tick, 5000);
  log.info('Планировщик напоминаний запущен');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Сколько данных у пользователя — то, что жалко потерять */
async function userStats(userId: string) {
  const [projects, estimates, photos] = await Promise.all([
    prisma.project.count({ where: { userId, deletedAt: null } }),
    prisma.estimate.count({ where: { userId, deletedAt: null, isTemplate: false } }),
    prisma.photo.count({ where: { userId, deletedAt: null } }),
  ]);
  const parts = [estimates && `смет: ${estimates}`, projects && `объектов: ${projects}`, photos && `фото: ${photos}`].filter(Boolean);
  return parts.length ? `У вас ${parts.join(', ')}.` : '';
}

/** Уведомления о подписке: за 3 дня до окончания и в день окончания (по одному разу) */
async function subscriptionNotices(bot: any, log: { error: (o: any, m?: string) => void }, appUrl: string) {
  const now = new Date();
  const kb = appUrl ? { inline_keyboard: [[{ text: 'Продлить подписку', web_app: { url: `${appUrl}/settings` } }]] } : undefined;
  const soon = await prisma.user.findMany({
    where: { subscriptionUntil: { gt: now, lte: new Date(now.getTime() + 3 * 864e5) }, subNotice3At: null }, take: 50,
  });
  const ended = await prisma.user.findMany({
    where: { subscriptionUntil: { lte: now, gt: new Date(now.getTime() - 7 * 864e5) }, subNoticeEndAt: null }, take: 50,
  });
  for (const u of soon) {
    if (env.ADMIN_TG_IDS.includes(String(u.tgId))) continue;
    const claimed = await prisma.user.updateMany({ where: { id: u.id, subNotice3At: null }, data: { subNotice3At: now } });
    if (!claimed.count) continue;
    const date = u.subscriptionUntil!.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
    const stats = await userStats(u.id);
    await bot.api.sendMessage(Number(u.tgId), `⏳ <b>Подписка СМЕТА PRO заканчивается ${date}.</b>\n${stats} Продлите, чтобы продолжать вести сметы, объекты и календарь без перерыва.`, { parse_mode: 'HTML', reply_markup: kb })
      .catch((e: any) => log.error({ err: e }, 'Не удалось отправить уведомление о подписке'));
  }
  for (const u of ended) {
    if (env.ADMIN_TG_IDS.includes(String(u.tgId))) continue;
    const claimed = await prisma.user.updateMany({ where: { id: u.id, subNoticeEndAt: null }, data: { subNoticeEndAt: now } });
    if (!claimed.count) continue;
    const stats = await userStats(u.id);
    await bot.api.sendMessage(Number(u.tgId), `🔒 <b>Подписка СМЕТА PRO закончилась.</b>\n${stats} Все данные сохранены и доступны для просмотра. Продлите подписку, чтобы снова их изменять.`, { parse_mode: 'HTML', reply_markup: kb })
      .catch((e: any) => log.error({ err: e }, 'Не удалось отправить уведомление о подписке'));
  }
}

/** Итоги недели: понедельник после 9:00 МСК, только тем, у кого есть доступ и включена рассылка */
async function weeklyDigests(bot: any, log: { error: (o: any, m?: string) => void }, appUrl: string) {
  const now = new Date();
  if (!digestDue(now, null)) return;
  const { from, to } = lastWeek(now);
  const users = await prisma.user.findMany({
    where: { weeklyDigest: true, OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(now.getTime() - 6 * 864e5) } }] },
    take: 30,
  });
  for (const u of users) {
    const claimed = await prisma.user.updateMany({
      where: { id: u.id, OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(now.getTime() - 6 * 864e5) } }] },
      data: { lastDigestAt: now },
    });
    if (!claimed.count || !accessOf(u).active) continue;
    try {
      const where = { userId: u.id, deletedAt: null };
      const [ops, photos, logs, estimates, approved, projects, rems] = await Promise.all([
        prisma.financeOp.findMany({ where: { ...where, date: { gte: from, lt: to }, project: { deletedAt: null } } }),
        prisma.photo.count({ where: { ...where, createdAt: { gte: from, lt: to } } }),
        prisma.workLog.count({ where: { ...where, createdAt: { gte: from, lt: to } } }),
        prisma.estimate.count({ where: { ...where, isTemplate: false, createdAt: { gte: from, lt: to } } }),
        prisma.estimate.count({ where: { ...where, approvedAt: { gte: from, lt: to } } }),
        prisma.project.findMany({
          where: { ...where, status: { notIn: ['archived', 'draft'] } },
          include: { estimates: { where: { deletedAt: null }, include: { lines: true } }, financeOps: { where: { deletedAt: null } } },
        }),
        prisma.reminder.findMany({ where: { ...where, active: true, remindAt: { gte: now, lt: new Date(now.getTime() + 7 * 864e5) } }, orderBy: { remindAt: 'asc' }, take: 5 }),
      ]);
      const s = summarize(ops.map((o) => ({ kind: o.kind, incomeType: o.incomeType, amount: num(o.amount), paidAmount: num(o.paidAmount), date: o.date, projectId: o.projectId })));
      const debts = projects.map((p) => ({ name: p.name, amount: projectFinance(p).customerDebt })).filter((d) => d.amount > 0);
      const text = digestText({
        received: s.total.received, spent: s.total.spent, unpaid: s.total.unpaid, photos, logs, estimates, approved, debts,
        reminders: rems.map((r) => ({ text: r.text, at: r.remindAt })),
      });
      if (!text) continue;
      await bot.api.sendMessage(Number(u.tgId), `${text}\n\n<i>Отключить итоги недели можно в Настройках.</i>`, {
        parse_mode: 'HTML',
        ...(appUrl ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть календарь', web_app: { url: `${appUrl}/calendar` } }]] } } : {}),
      });
    } catch (e) { log.error({ err: e }, 'Не удалось отправить итоги недели'); }
  }
}
