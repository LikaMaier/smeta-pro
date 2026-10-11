/**
 * Итоги недели для бота: каждый понедельник после 9:00 по Москве.
 * Чистые функции — тестируются отдельно.
 */
export const MSK_OFFSET = 3 * 3600e3;

/** Пора ли отправлять: понедельник, 9:00–23:59 МСК, и за последние 6 дней ещё не отправляли */
export function digestDue(now: Date, lastAt: Date | null): boolean {
  const msk = new Date(now.getTime() + MSK_OFFSET);
  if (msk.getUTCDay() !== 1 || msk.getUTCHours() < 9) return false;
  return !lastAt || now.getTime() - lastAt.getTime() > 6 * 864e5;
}

/** Границы прошлой недели (пн 00:00 — пн 00:00 МСК) в UTC */
export function lastWeek(now: Date) {
  const msk = new Date(now.getTime() + MSK_OFFSET);
  const day = (msk.getUTCDay() + 6) % 7; // 0 = понедельник
  const mondayMsk = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() - day);
  const to = new Date(mondayMsk - MSK_OFFSET);
  return { from: new Date(to.getTime() - 7 * 864e5), to };
}

export interface DigestData {
  received: number; spent: number; unpaid: number;
  photos: number; logs: number; estimates: number; approved: number;
  debts: { name: string; amount: number }[];
  reminders: { text: string; at: Date }[];
}

const rub = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₽`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Текст сообщения или null, если за неделю ничего не было и сказать нечего */
export function digestText(d: DigestData): string | null {
  const debtSum = d.debts.reduce((s, x) => s + x.amount, 0);
  const quiet = !d.received && !d.spent && !d.photos && !d.logs && !d.estimates && !debtSum && !d.reminders.length;
  if (quiet) return null;
  const out: string[] = ['📊 <b>Итоги недели</b>'];
  if (d.received || d.spent) {
    const earned = d.received - d.spent;
    out.push(`Получено: <b>${rub(d.received)}</b>\nПотрачено: <b>${rub(d.spent)}</b>\nЗаработано: <b>${earned < 0 ? '−' : ''}${rub(Math.abs(earned))}</b>`);
  } else out.push('Движения денег за неделю не было.');
  const work = [d.estimates && `смет: ${d.estimates}`, d.approved && `согласовано заказчиками: ${d.approved}`, d.photos && `фото: ${d.photos}`, d.logs && `записей о работе: ${d.logs}`].filter(Boolean);
  if (work.length) out.push(`Сделано: ${work.join(', ')}.`);
  if (d.unpaid > 0) out.push(`⚠️ Не оплачено поставщикам и рабочим: ${rub(d.unpaid)}`);
  if (debtSum > 0) {
    const top = [...d.debts].sort((a, b) => b.amount - a.amount).slice(0, 3);
    out.push(`💰 Вам должны заказчики: <b>${rub(debtSum)}</b>\n${top.map((x) => `• ${esc(x.name)} — ${rub(x.amount)}`).join('\n')}`);
  }
  if (d.reminders.length) {
    const fmt = (t: Date) => new Date(t.getTime() + MSK_OFFSET).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2.$1');
    out.push(`⏰ На этой неделе:\n${d.reminders.slice(0, 5).map((r) => `• ${fmt(r.at)} — ${esc(r.text)}`).join('\n')}`);
  }
  return out.join('\n\n');
}
