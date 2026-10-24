/**
 * Подробная статистика для администратора в боте:
 *   /users          — пользователи: когда пришли, заходы, сметы, оплата, заблокировал ли бота
 *   /user <id|@ник> — один пользователь: все его сметы и что в них добавлено
 *   /smety [дни]    — последние сметы пользователей с позициями (по умолчанию 7 дней)
 *   /top [дни]      — что добавляют чаще всего: работы, направления, шаблоны
 *   /blocked        — кто заблокировал бота (+ кнопка «Проверить всех»)
 * Блокировку бот узнаёт сам (Telegram присылает событие), старых пользователей можно проверить кнопкой.
 */
import type { Bot } from 'grammy';
import { prisma } from './util';
import { reportTo } from './stats';

const MSK = 3 * 3600e3;
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rub = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
const dt = (d: Date | string) => new Date(new Date(d).getTime() + MSK).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2.$1');
const who = (u: { firstName: string | null; username: string | null; tgId?: bigint }) => `${esc(u.firstName || 'без имени')}${u.username ? ` @${esc(u.username)}` : ''}`;
const num = (v: any) => Number(v) || 0;
const BLK = 'blocked:';

const isAdmin = (id?: number) => !!id && reportTo().includes(String(id));

async function adminIds() {
  const ids = reportTo().filter((x) => /^\d+$/.test(x)).map((x) => BigInt(x));
  return (await prisma.user.findMany({ where: { tgId: { in: ids } }, select: { id: true } })).map((u) => u.id);
}

/** Заблокировавшие: tgId → дата */
async function blockedMap() {
  const rows = await prisma.appKV.findMany({ where: { key: { startsWith: BLK } } });
  return new Map(rows.map((r) => [r.key.slice(BLK.length), r.value]));
}
export async function markBlocked(tgId: number | bigint | string, blocked: boolean) {
  const key = `${BLK}${tgId}`;
  if (blocked) await prisma.appKV.upsert({ where: { key }, create: { key, value: new Date().toISOString() }, update: {} });
  else await prisma.appKV.deleteMany({ where: { key } });
}

/** Сумма сметы без наценок и скидок — для обзора хватает */
const estTotal = (lines: any[]) => lines.reduce((a, l) => a + num(l.qty) * (num(l.price) + num(l.matPrice)), 0);

/** Telegram ограничивает сообщение 4096 символами — режем по строкам */
async function sendLong(ctx: any, text: string, extra: any = {}) {
  const parts: string[] = []; let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > 3800) { parts.push(cur); cur = line; } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) parts.push(cur);
  for (let i = 0; i < parts.length; i++) await ctx.reply(parts[i], { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(i === parts.length - 1 ? extra : {}) });
}

async function findUser(q: string) {
  const s = q.trim().replace(/^@/, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) return prisma.user.findFirst({ where: { OR: [{ tgId: BigInt(s) }] } });
  return prisma.user.findFirst({ where: { OR: [{ username: { equals: s, mode: 'insensitive' } }, { firstName: { equals: s, mode: 'insensitive' } }] } });
}

export function attachAdminStats(bot: Bot) {
  // Любая отправка, на которую Telegram ответил «бот заблокирован» (403), — тоже отмечаем
  bot.api.config.use(async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    const chat = (payload as any)?.chat_id;
    if (!res.ok && res.error_code === 403 && typeof chat === 'number' && chat > 0 && /blocked|deactivated/i.test(res.description || '')) markBlocked(chat, true).catch(() => {});
    return res;
  });
  // Telegram сообщает, когда пользователь заблокировал или разблокировал бота
  bot.on('my_chat_member', async (ctx) => {
    const st = ctx.myChatMember.new_chat_member.status;
    if (ctx.chat.type !== 'private') return;
    if (st === 'kicked') await markBlocked(ctx.myChatMember.from.id, true).catch(() => {});
    else if (st === 'member') await markBlocked(ctx.myChatMember.from.id, false).catch(() => {});
  });

  bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const skip = await adminIds();
    const [users, blocked] = await Promise.all([
      prisma.user.findMany({
        where: { id: { notIn: skip } }, orderBy: { createdAt: 'desc' }, take: 60,
        select: { id: true, tgId: true, firstName: true, username: true, createdAt: true, subscriptionUntil: true, plan: true,
          _count: { select: { estimates: { where: { deletedAt: null, isTemplate: false } } } } },
      }),
      blockedMap(),
    ]);
    const total = await prisma.user.count({ where: { id: { notIn: skip } } });
    const days = await prisma.userDay.groupBy({ by: ['userId'], where: { userId: { in: users.map((u) => u.id) } }, _sum: { opens: true }, _max: { lastAt: true } });
    const dmap = new Map(days.map((d) => [d.userId, d]));
    const now = new Date();
    const withEst = users.filter((u) => u._count.estimates > 0).length;
    const L = [`👥 <b>Пользователи</b> — всего ${total}, показаны последние ${users.length}`,
      `🚫 заблокировали бота: <b>${[...blocked.keys()].length}</b> · 🧾 сделали смету: ${withEst} из ${users.length}`, '',
      '<i>имя · пришёл · заходов · последний заход · смет · оплата</i>'];
    for (const u of users) {
      const d = dmap.get(u.id);
      const paid = u.subscriptionUntil && u.subscriptionUntil > now ? ` 💳${u.plan}` : '';
      L.push(`${blocked.has(String(u.tgId)) ? '🚫 ' : ''}${who(u)} · ${dt(u.createdAt)} · ${d?._sum.opens ?? 0} · ${d?._max.lastAt ? dt(d._max.lastAt) : '—'} · 🧾${u._count.estimates}${paid}  <code>/user ${u.tgId}</code>`);
    }
    await sendLong(ctx, L.join('\n'));
  });

  bot.command('user', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const u = await findUser(String(ctx.match || ''));
    if (!u) return ctx.reply('Напишите: /user 123456789 или /user @ник (ID есть в /users)');
    const [ests, days, pays, blocked, src, trade] = await Promise.all([
      prisma.estimate.findMany({ where: { userId: u.id, isTemplate: false }, orderBy: { createdAt: 'desc' }, take: 15, include: { lines: { orderBy: { position: 'asc' } } } }),
      prisma.userDay.aggregate({ where: { userId: u.id }, _sum: { opens: true }, _count: true, _max: { lastAt: true } }),
      prisma.payment.findMany({ where: { userId: u.id, status: 'paid' }, select: { planCode: true, amountRub: true, stars: true, createdAt: true } }),
      prisma.appKV.findUnique({ where: { key: `${BLK}${u.tgId}` } }),
      prisma.appKV.findUnique({ where: { key: `src:${u.id}` } }),
      prisma.appKV.findUnique({ where: { key: `trade:${u.tgId}` } }),
    ]);
    const L = [`👤 <b>${who(u)}</b> <code>${u.tgId}</code>`,
      `Пришёл: ${dt(u.createdAt)}${src ? ` · из «${esc(src.value)}»` : ''}${trade ? ` · занимается: ${esc(trade.value)}` : ''}`,
      `Заходил: ${days._count} дн., открытий ${days._sum.opens ?? 0}, последний ${days._max.lastAt ? dt(days._max.lastAt) : '—'}`,
      blocked ? `🚫 Заблокировал бота ${dt(blocked.value)}` : '✅ Бот не заблокирован',
      pays.length ? `💳 Оплаты: ${pays.map((p) => `${p.planCode} ${p.amountRub ? rub(p.amountRub) : `${p.stars}⭐`} (${dt(p.createdAt)})`).join(', ')}` : '💳 Оплат нет', ''];
    if (!ests.length) L.push('Смет нет.');
    for (const e of ests) {
      L.push(`🧾 <b>${esc(e.title)}</b>${e.deletedAt ? ' <i>(удалена)</i>' : ''} — ${rub(estTotal(e.lines))}, ${e.lines.length} поз., ${dt(e.createdAt)}${e.source && e.source !== 'manual' ? ` · ${esc(e.source)}` : ''}${e.sharedAt ? ' · отправлена заказчику' : ''}${e.approvedAt ? ' · ✅ согласована' : ''}`);
      for (const l of e.lines.slice(0, 25)) L.push(`   • ${esc(l.name)} — ${num(l.qty)} ${esc(l.unit)} × ${rub(num(l.price) + num(l.matPrice))}`);
      if (e.lines.length > 25) L.push(`   … ещё ${e.lines.length - 25}`);
    }
    await sendLong(ctx, L.join('\n'));
  });

  bot.command('smety', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const days = Math.min(90, Math.max(1, Number(String(ctx.match || '').trim()) || 7));
    const skip = await adminIds();
    const ests = await prisma.estimate.findMany({
      where: { userId: { notIn: skip }, isTemplate: false, createdAt: { gte: new Date(Date.now() - days * 864e5) } },
      orderBy: { createdAt: 'desc' }, take: 40,
      include: { user: { select: { firstName: true, username: true, tgId: true } }, lines: { orderBy: { position: 'asc' }, select: { name: true, qty: true, unit: true, price: true, matPrice: true } } },
    });
    const L = [`🧾 <b>Сметы пользователей за ${days} дн.</b> — ${ests.length}${ests.length === 40 ? ' (последние 40)' : ''}`, ''];
    for (const e of ests) {
      L.push(`<b>${esc(e.title)}</b> — ${rub(estTotal(e.lines))} · ${who(e.user)} · ${dt(e.createdAt)}${e.deletedAt ? ' · удалена' : ''}${e.sharedAt ? ' · отправлена' : ''}`);
      L.push(`   ${e.lines.slice(0, 8).map((l) => `${esc(l.name)} ${num(l.qty)} ${esc(l.unit)}`).join('; ')}${e.lines.length > 8 ? `; … ещё ${e.lines.length - 8}` : ''}`);
    }
    if (!ests.length) L.push('Смет за этот период нет.');
    await sendLong(ctx, L.join('\n'));
  });

  bot.command('top', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const days = Math.min(365, Math.max(1, Number(String(ctx.match || '').trim()) || 30));
    const skip = await adminIds();
    const since = new Date(Date.now() - days * 864e5);
    const where = { estimate: { userId: { notIn: skip }, isTemplate: false, createdAt: { gte: since } } };
    const [names, cats, sources, ests] = await Promise.all([
      prisma.estimateLine.groupBy({ by: ['name'], where, _count: { _all: true }, orderBy: { _count: { name: 'desc' } }, take: 25 }),
      prisma.estimateLine.groupBy({ by: ['category'], where, _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 12 }),
      prisma.estimate.groupBy({ by: ['source'], where: { userId: { notIn: skip }, isTemplate: false, createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.estimate.findMany({ where: { userId: { notIn: skip }, isTemplate: false, createdAt: { gte: since } }, select: { lines: { select: { qty: true, price: true, matPrice: true } }, sharedAt: true, approvedAt: true } }),
    ]);
    const totals = ests.map((e) => estTotal(e.lines)).filter((x) => x > 0).sort((a, b) => a - b);
    const med = totals.length ? totals[Math.floor(totals.length / 2)] : 0;
    const SRC: Record<string, string> = { manual: 'вручную/мастер', template: 'из шаблона', quick: 'быстрая смета', ai: 'ИИ' };
    const L = [`🏆 <b>Что делают за ${days} дн.</b>`, '',
      `Смет: ${ests.length} · отправлено заказчику ${ests.filter((e) => e.sharedAt).length} · согласовано ${ests.filter((e) => e.approvedAt).length}`,
      `Средняя смета (медиана): ${rub(med)}${totals.length ? ` · самая крупная ${rub(totals[totals.length - 1])}` : ''}`,
      `Как создают: ${sources.map((s) => `${SRC[s.source] || s.source} — ${s._count._all}`).join(', ') || '—'}`, '',
      '<b>Разделы:</b>', ...cats.map((c) => `   ${esc(c.category || 'без раздела')} — ${c._count._all}`), '',
      '<b>Чаще всего добавляют:</b>', ...names.map((n, i) => `   ${i + 1}. ${esc(n.name)} — ${n._count._all}`)];
    await sendLong(ctx, L.join('\n'));
  });

  bot.command('blocked', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const b = await blockedMap();
    const users = b.size ? await prisma.user.findMany({ where: { tgId: { in: [...b.keys()].map((x) => BigInt(x)) } }, select: { firstName: true, username: true, tgId: true, createdAt: true, _count: { select: { estimates: true } } } }) : [];
    const total = await prisma.user.count();
    const L = [`🚫 <b>Заблокировали бота: ${b.size}</b> из ${total} (${total ? Math.round((b.size / total) * 100) : 0}%)`, ''];
    for (const u of users.sort((x, y) => (b.get(String(y.tgId)) || '').localeCompare(b.get(String(x.tgId)) || ''))) {
      L.push(`${who(u)} — заблокировал ${dt(b.get(String(u.tgId))!)} · пришёл ${dt(u.createdAt)} · смет ${u._count.estimates}  <code>/user ${u.tgId}</code>`);
    }
    L.push('', '<i>Новые блокировки бот видит сам. Для тех, кто заблокировал раньше, нажмите «Проверить всех» — бот тихо проверит каждого.</i>');
    await sendLong(ctx, L.join('\n'), { reply_markup: { inline_keyboard: [[{ text: '🔎 Проверить всех', callback_data: 'adm:probe' }]] } });
  });

  // Разовая проверка всех: «печатает…» на секунду; если бот заблокирован, Telegram ответит ошибкой 403
  bot.callbackQuery('adm:probe', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery({ text: 'Проверяю, это займёт до пары минут…' });
    const users = await prisma.user.findMany({ select: { tgId: true } });
    let blocked = 0, ok = 0;
    for (const u of users) {
      try { await ctx.api.sendChatAction(Number(u.tgId), 'typing'); await markBlocked(u.tgId, false); ok++; }
      catch (e: any) { if (e?.error_code === 403) { await markBlocked(u.tgId, true); blocked++; } }
      await new Promise((r) => setTimeout(r, 60)); // не больше ~15 запросов в секунду
    }
    await ctx.reply(`Проверено ${users.length}: бот доступен у ${ok}, заблокирован у ${blocked}. Подробно — /blocked`);
  });
}

/** Строка для сводки /stats */
export async function blockedLine() {
  const n = await prisma.appKV.count({ where: { key: { startsWith: BLK } } });
  const day = await prisma.appKV.count({ where: { key: { startsWith: BLK }, value: { gte: new Date(Date.now() - 864e5).toISOString() } } });
  return `🚫 Заблокировали бота: <b>${n}</b>${day ? ` (за сутки +${day})` : ''} · /blocked`;
}
