/**
 * Напоминания: виды, повторы, «напомнить заранее».
 * Время хранится в UTC; для повторов по дням недели нужен часовой пояс пользователя (tz — минуты к востоку от UTC).
 */
export interface RepeatOpts { days?: number[] | null; tz?: number | null }

const addMonths = (d: Date, months: number, day: number) => {
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); // 31-е → последний день короткого месяца
};

/** День недели (0 — вс) в часовом поясе пользователя */
export const localWeekday = (d: Date, tz = 180) => new Date(d.getTime() + tz * 60000).getUTCDay();

/** Следующее время для повторяющегося напоминания: строго позже `now` */
export function nextRun(at: Date, repeat: string, now: Date = new Date(), opts: RepeatOpts = {}): Date | null {
  if (repeat === 'none') return null;
  const d = new Date(at);
  const day = new Date(at.getTime() + (opts.tz ?? 180) * 60000).getUTCDate(); // число месяца по местному времени
  const tz = opts.tz ?? 180;
  const days = repeat === 'weekdays' ? [1, 2, 3, 4, 5] : repeat === 'days' ? (opts.days || []).filter((x) => x >= 0 && x <= 6) : null;
  if (days && !days.length) return null;
  let guard = 0;
  const step = () => {
    if (repeat === 'daily' || days) d.setUTCDate(d.getUTCDate() + 1);
    else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (repeat === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
    else if (repeat === 'monthly' || repeat === 'quarterly' || repeat === 'yearly') {
      // месяцы считаем по местной дате, чтобы 1-е число в 00:30 МСК не «уезжало» на 31-е
      const local = new Date(d.getTime() + tz * 60000);
      addMonths(local, repeat === 'monthly' ? 1 : repeat === 'quarterly' ? 3 : 12, day);
      d.setTime(local.getTime() - tz * 60000);
    } else return false;
    return true;
  };
  while ((d <= now || (days && !days.includes(localWeekday(d, tz)))) && guard++ < 5000) {
    if (!step()) return null;
  }
  return d;
}

/** Когда отправить предупреждение «заранее»: null — если не нужно или уже поздно */
export function preTime(at: Date, before: number, now: Date = new Date()): Date | null {
  if (!before || before <= 0) return null;
  const t = new Date(at.getTime() - before * 60000);
  return t > now ? t : null;
}

export const REPEAT_LABEL: Record<string, string> = {
  none: 'Один раз', daily: 'Каждый день', weekdays: 'По будням', days: 'По дням недели', weekly: 'Каждую неделю',
  biweekly: 'Раз в 2 недели', monthly: 'Каждый месяц', quarterly: 'Раз в квартал', yearly: 'Каждый год',
};
export const REPEATS = Object.keys(REPEAT_LABEL) as (keyof typeof REPEAT_LABEL)[];

export const WEEKDAYS = [{ v: 1, t: 'Пн' }, { v: 2, t: 'Вт' }, { v: 3, t: 'Ср' }, { v: 4, t: 'Чт' }, { v: 5, t: 'Пт' }, { v: 6, t: 'Сб' }, { v: 0, t: 'Вс' }];

export const BEFORE_LABEL: Record<number, string> = { 0: 'Не нужно', 15: 'За 15 минут', 60: 'За час', 180: 'За 3 часа', 1440: 'За день', 2880: 'За 2 дня', 10080: 'За неделю' };
export const beforeText = (m: number) => (m >= 1440 ? `${m / 1440 === 1 ? 'завтра' : `через ${m / 1440} дн.`}` : m >= 60 ? `через ${m / 60} ч` : `через ${m} мин`);

/** Виды напоминаний: значок, подсказки текста и удобные настройки по умолчанию */
export const REM_KINDS: { id: string; icon: string; label: string; ideas: string[]; time?: string; repeat?: string; before?: number }[] = [
  { id: 'money', icon: '💰', label: 'Деньги', ideas: ['Забрать оплату у заказчика', 'Получить аванс', 'Выставить счёт', 'Напомнить заказчику о долге'], time: '10:00' },
  { id: 'material', icon: '🧱', label: 'Материалы', ideas: ['Заказать бетон', 'Закупить материалы', 'Приёмка доставки', 'Забрать заказ на базе'], time: '08:00', before: 60 },
  { id: 'tech', icon: '🚜', label: 'Техника', ideas: ['Вернуть технику', 'Заказать экскаватор', 'Заказать манипулятор', 'Продлить аренду'], time: '08:00', before: 1440 },
  { id: 'call', icon: '📞', label: 'Звонок', ideas: ['Позвонить заказчику', 'Перезвонить поставщику', 'Уточнить размеры'], time: '11:00' },
  { id: 'meet', icon: '📏', label: 'Замер / встреча', ideas: ['Замер на объекте', 'Встреча с заказчиком', 'Показать смету'], time: '10:00', before: 180 },
  { id: 'crew', icon: '👷', label: 'Бригада', ideas: ['Заплатить бригаде', 'Выдать аванс рабочим', 'Собрать бригаду на объект'], time: '18:00', repeat: 'weekly' },
  { id: 'docs', icon: '📄', label: 'Документы', ideas: ['Подписать акт', 'Отправить смету', 'Подписать договор', 'Сдать исполнительную'], time: '12:00' },
  { id: 'tax', icon: '🧾', label: 'Налоги', ideas: ['Аванс по УСН', 'Взносы ИП', 'Отчёт в налоговую', 'Оплатить патент'], time: '10:00', repeat: 'quarterly', before: 2880 },
  { id: 'deadline', icon: '🏁', label: 'Сдача объекта', ideas: ['Сдать объект', 'Финальная уборка', 'Подготовить фотоотчёт'], time: '09:00', before: 1440 },
  { id: 'personal', icon: '🎂', label: 'Личное', ideas: ['День рождения', 'Техосмотр машины', 'Страховка', 'Отдохнуть'], time: '09:00', repeat: 'yearly' },
  { id: 'other', icon: '⏰', label: 'Другое', ideas: [] },
];
export const kindOf = (id?: string | null) => REM_KINDS.find((k) => k.id === id) || REM_KINDS[REM_KINDS.length - 1];
