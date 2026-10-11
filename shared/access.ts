/**
 * Бесплатный доступ без подписки: одна смета (создать, править, PDF), калькуляторы и справочник цен.
 * Всё остальное — объекты, финансы, календарь, фото, напоминания, записная книжка, ИИ — по подписке.
 * Просмотр (GET) доступен всегда: данные не теряются.
 */
export interface FreeCtx { estimateCount: number; firstEstimateId: string | null }

const ALWAYS = [/^\/api\/auth\//, /^\/api\/me$/, /^\/api\/me\/brand\/(logo|sign)$/, /^\/api\/pay\//];
const CATALOG = [/^\/api\/items(\/|$)/, /^\/api\/pricelists(\/|$)/];
const FIRST_ESTIMATE_SUB = ['', '/lines', '/pdf/send', '/file/pdf/send', '/refresh-prices', '/share'];

export function freeWriteAllowed(method: string, url: string, ctx: FreeCtx): boolean {
  if (ALWAYS.some((r) => r.test(url))) return true;
  if (CATALOG.some((r) => r.test(url))) return true;
  if (method === 'POST' && url === '/api/estimates') return ctx.estimateCount === 0;
  const m = /^\/api\/estimates\/([^/]+)(\/.*)?$/.exec(url);
  if (m && ctx.firstEstimateId && m[1] === ctx.firstEstimateId && FIRST_ESTIMATE_SUB.includes(m[2] || '')) return true;
  return false;
}

/** Нужен ли запрос к базе, чтобы решить (экономим запросы для прочих маршрутов) */
export const needsEstimateCtx = (url: string) => url === '/api/estimates' || url.startsWith('/api/estimates/');
