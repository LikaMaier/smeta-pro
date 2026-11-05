/**
 * Воронка активации по когортам: пришёл → открыл приложение → первая смета → отправил заказчику → заказчик открыл
 * → начал оплату → оплатил. Плюс путь к первой смете (шаблон, мастер, быстрая, пустая) и время до неё.
 * Только агрегаты, без имён. /funnel [дни] — администратору в боте; при запуске сервера — одна строка в лог.
 */
import { prisma } from './util';
import { reportTo } from './stats';

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export async function activationStats(days = 30) {
  const since = new Date(Date.now() - days * 864e5);
  const adminTg = reportTo().filter((x) => /^\d+$/.test(x)).map((x) => BigInt(x));
  const users = await prisma.user.findMany({ where: { createdAt: { gte: since }, tgId: { notIn: adminTg } }, select: { id: true, createdAt: true, tgId: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { days, users: 0 } as any;
  const born = new Map(users.map((u) => [u.id, u.createdAt.getTime()]));
  const [daysRows, ests, audits, pays, trades, blocked, igb] = await Promise.all([
    prisma.userDay.findMany({ where: { userId: { in: ids } }, select: { userId: true, day: true, firstAt: true } }),
    prisma.estimate.findMany({ where: { userId: { in: ids }, isTemplate: false }, select: { id: true, userId: true, createdAt: true, sharedAt: true, viewedAt: true, approvedAt: true, source: true, deletedAt: true, _count: { select: { lines: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.auditLog.findMany({ where: { userId: { in: ids }, entity: { in: ['estimate', 'checkout', 'design', 'wizard', 'calc'] } }, select: { userId: true, entity: true, entityId: true, action: true, data: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    prisma.payment.findMany({ where: { userId: { in: ids }, status: 'paid' }, select: { userId: true, planCode: true } }),
    prisma.appKV.findMany({ where: { key: { in: users.map((u) => `trade:${u.tgId}`) } }, select: { value: true } }),
    prisma.appKV.count({ where: { key: { in: users.map((u) => `blocked:${u.tgId}`) } } }),
    prisma.appKV.count({ where: { key: { startsWith: 'igb:done:' } } }).catch(() => 0),
  ]);
  const opened = new Set(daysRows.map((d) => d.userId));
  const d1 = new Set(daysRows.filter((d) => d.firstAt.getTime() - (born.get(d.userId) || 0) > 20 * 3600e3).map((d) => d.userId));
  const firstEst = new Map<string, typeof ests[number]>();
  for (const e of ests) if (!firstEst.has(e.userId)) firstEst.set(e.userId, e);
  const withEst = new Set(ests.map((e) => e.userId));
  const with3 = new Set(ests.filter((e) => e._count.lines >= 3).map((e) => e.userId));
  const sentKinds = new Set(['pdf_sent', 'act_sent', 'contract_sent', 'xlsx_sent', 'xlsxown_sent', 'share']);
  const sent = new Set(audits.filter((a) => a.entity === 'estimate' && sentKinds.has(a.action)).map((a) => a.userId));
  ests.filter((e) => e.sharedAt).forEach((e) => sent.add(e.userId));
  const viewed = new Set(ests.filter((e) => e.viewedAt).map((e) => e.userId));
  const approved = new Set(ests.filter((e) => e.approvedAt).map((e) => e.userId));
  const checkout = new Set(audits.filter((a) => a.entity === 'checkout').map((a) => a.userId));
  const paid = new Set(pays.map((p) => p.userId));
  const designers = new Set(audits.filter((a) => a.entity === 'design').map((a) => a.userId));
  // путь к первой смете: по записи «create» и тому, что было сразу после
  const path: Record<string, number> = {};
  for (const [uid, e] of firstEst) {
    const cr = audits.find((a) => a.entity === 'estimate' && a.entityId === e.id && a.action === 'create');
    const d: any = cr?.data || {};
    let p = d.lead ? 'заявка с калькулятора' : d.wizard ? 'мастер 3 шага' : d.template ? 'шаблон' : d.quick ? 'быстрая' : d.fromId || d.duplicateOf ? 'копия' : d.source === 'ai' ? 'ИИ' : d.lines ? 'готовые строки' : 'пустая';
    if (p === 'пустая' && audits.some((a) => a.entityId === e.id && a.action === 'add_lines' && a.createdAt.getTime() - e.createdAt.getTime() < 120e3)) p = 'мастер/калькулятор';
    if (p === 'пустая' && e._count.lines === 0) p = 'пустая (без строк)';
    path[p] = (path[p] || 0) + 1;
    void uid;
  }
  const ttf = [...firstEst.values()].map((e) => (e.createdAt.getTime() - (born.get(e.userId) || 0)) / 60e3).filter((m) => m >= 0);
  const wz = (a: string) => new Set(audits.filter((x) => x.entity === 'wizard' && x.action === a).map((x) => x.userId)).size;
  const wizard = { opened: wz('fw_open'), picked: wz('fw_job'), result: wz('fw_result'), pdf: wz('fw_pdf'), link: wz('fw_link'), offer: wz('fw_offer'), skip: wz('fw_skip') };
  const calcA = audits.filter((x) => x.entity === 'calc');
  const calc = { builders: new Set(calcA.filter((x) => x.action === 'view').map((x) => x.userId)).size, views: calcA.filter((x) => x.action === 'view').length, leads: calcA.filter((x) => x.action === 'lead').length };
  const tradeBy: Record<string, number> = {};
  for (const t of trades) tradeBy[t.value] = (tradeBy[t.value] || 0) + 1;
  const plans: Record<string, number> = {};
  for (const p of pays) plans[p.planCode] = (plans[p.planCode] || 0) + 1;
  return {
    days, users: ids.length, opened: opened.size, returnedNextDay: d1.size, firstEstimate: withEst.size, estimate3lines: with3.size,
    sentToCustomer: sent.size, customerViewed: viewed.size, customerApproved: approved.size, checkoutStarted: checkout.size, paid: paid.size,
    designers: designers.size, blocked, igBonusTotal: igb, estimatesTotal: ests.length, estimatesDeleted: ests.filter((e) => e.deletedAt).length,
    emptyEstimates: ests.filter((e) => e._count.lines === 0).length,
    firstPath: path, minutesToFirstEstimate: { median: median(ttf), within10: ttf.filter((m) => m <= 10).length, within60: ttf.filter((m) => m <= 60).length },
    trades: tradeBy, plans, wizard, calc,
  };
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export async function activationText(days = 30) {
  const s: any = await activationStats(days);
  if (!s.users) return `За ${days} дн. новых пользователей нет.`;
  const L = [`🧭 <b>Воронка активации за ${days} дн.</b> (новые пользователи)`, '',
    `👤 Пришли в бота: <b>${s.users}</b>`,
    `📱 Открыли приложение: <b>${s.opened}</b> (${pct(s.opened, s.users)})`,
    `🧾 Сделали смету: <b>${s.firstEstimate}</b> (${pct(s.firstEstimate, s.users)})`,
    `   • в смете 3+ позиции: ${s.estimate3lines}`,
    `📨 Отправили заказчику: <b>${s.sentToCustomer}</b> (${pct(s.sentToCustomer, s.users)})`,
    `👀 Заказчик открыл: ${s.customerViewed} · согласовал: ${s.customerApproved}`,
    `🛒 Начали оплату: <b>${s.checkoutStarted}</b> · 💳 оплатили: <b>${s.paid}</b> (${pct(s.paid, s.users)})`,
    `🔁 Вернулись на следующий день: ${s.returnedNextDay}`,
    `🏗 Пробовали 3D: ${s.designers} · 🚫 заблокировали бота: ${s.blocked}`, '',
    `⏱ До первой сметы: медиана ${s.minutesToFirstEstimate.median == null ? '—' : `${Math.round(s.minutesToFirstEstimate.median)} мин`}, за 10 мин — ${s.minutesToFirstEstimate.within10}, за час — ${s.minutesToFirstEstimate.within60}`,
    `🛣 Путь к первой смете: ${Object.entries(s.firstPath).map(([k, v]) => `${k} — ${v}`).join(', ') || '—'}`,
    `👷 Специальности: ${Object.entries(s.trades).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]) => `${k} — ${v}`).join(', ') || '—'}`,
    `Пустых смет: ${s.emptyEstimates} из ${s.estimatesTotal}`];
  const w = s.wizard;
  if (w?.opened) L.push('', `🪄 <b>Первая смета за 3 шага</b>: открыли ${w.opened} → выбрали работу ${w.picked} → увидели смету ${w.result} → PDF ${w.pdf} · ссылкой ${w.link} · тарифы ${w.offer} · пропустили ${w.skip}`);
  return L.join('\n');
}
