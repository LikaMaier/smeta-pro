/**
 * Бесплатный доступ без подписки: три сметы в месяц (+ купленные раньше пакеты), калькуляторы, справочник цен,
 * календарь с фото и журналом, напоминания, проектировщик (1 эскизный PDF).
 * Объекты, финансы, записная книжка, договоры и ИИ — по подписке (уровни — shared/plans.ts).
 * Просмотр (GET) доступен всегда: данные не теряются.
 */
/** Сколько смет можно сделать без подписки — каждый месяц (по Москве) */
export const FREE_ESTIMATES = 3;

/**
 * Бесплатные сметы: первые FREE_ESTIMATES каждого месяца + купленные раньше пакеты (сверх месячных, по порядку).
 * freeIds — сметы, которые бесплатный пользователь может редактировать; left — сколько ещё можно создать сейчас.
 */
export function freeAllowance(list: { id: string; createdAt: Date | string }[], extra: number, nowMonth: string, monthOf: (d: Date) => string) {
  const sorted = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const perMonth: Record<string, number> = {};
  const freeIds: string[] = [];
  let packUsed = 0;
  for (const e of sorted) {
    const m = monthOf(new Date(e.createdAt));
    perMonth[m] = (perMonth[m] || 0) + 1;
    if (perMonth[m] <= FREE_ESTIMATES) freeIds.push(e.id);
    else if (packUsed < extra) { packUsed++; freeIds.push(e.id); }
  }
  const thisMonth = perMonth[nowMonth] || 0;
  const left = Math.max(0, FREE_ESTIMATES - thisMonth) + Math.max(0, extra - packUsed);
  return { thisMonth, left, freeIds };
}
export interface FreeCtx { estimateCount: number; freeEstimateIds: string[]; limit?: number }

const ALWAYS = [/^\/api\/auth\//, /^\/api\/me$/, /^\/api\/me\/brand\/(logo|sign)$/, /^\/api\/pay\//, /^\/api\/team\/join$/, /^\/api\/ai\/wish$/];
// календарь (фото, журнал) и напоминания — бесплатно
const ORGANIZER = [/^\/api\/reminders(\/|$)/, /^\/api\/photos(\/|$)/, /^\/api\/worklogs(\/|$)/];
const CATALOG = [/^\/api\/items(\/|$)/, /^\/api\/pricelists(\/|$)/];
// проектировщик: модель, сохранение и PDF (с пометкой) — бесплатно; разбор описания ИИ — по подписке
const DESIGNER = [/^\/api\/designs(\/|$)/, /^\/api\/designer\/pdf\/send$/, /^\/api\/site(\/|$)/];
const FIRST_ESTIMATE_SUB = ['', '/lines', '/pdf/send', '/file/pdf/send', '/refresh-prices', '/share', '/purchased'];

export function freeWriteAllowed(method: string, url: string, ctx: FreeCtx): boolean {
  if (ALWAYS.some((r) => r.test(url))) return true;
  if (CATALOG.some((r) => r.test(url))) return true;
  if (DESIGNER.some((r) => r.test(url))) return true;
  if (ORGANIZER.some((r) => r.test(url))) return true;
  if (method === 'POST' && (url === '/api/estimates' || url === '/api/estimates/import')) return ctx.estimateCount < (ctx.limit ?? FREE_ESTIMATES);
  const m = /^\/api\/estimates\/([^/]+)(\/.*)?$/.exec(url);
  if (m && ctx.freeEstimateIds.includes(m[1]) && FIRST_ESTIMATE_SUB.includes(m[2] || '')) return true;
  return false;
}

/** Нужен ли запрос к базе, чтобы решить (экономим запросы для прочих маршрутов) */
export const needsEstimateCtx = (url: string) => url === '/api/estimates' || url.startsWith('/api/estimates/');
