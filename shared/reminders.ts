/** Следующее время для повторяющегося напоминания: строго позже `now` */
export function nextRun(at: Date, repeat: string, now: Date = new Date()): Date | null {
  if (repeat === 'none') return null;
  const d = new Date(at);
  let guard = 0;
  while (d <= now && guard++ < 5000) {
    if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (repeat === 'monthly') {
      const day = at.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, last)); // 31-е → последний день короткого месяца
    } else return null;
  }
  return d;
}

export const REPEAT_LABEL: Record<string, string> = { none: 'Один раз', daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц' };
