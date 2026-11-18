// Мок сервера для локального предпросмотра: память вместо базы, те же формы ответов
import { STARTER_PRICES } from '../../shared/starterPrices';
import { getTemplate, TEMPLATES } from '../../shared/templates';
import { calcEstimate } from '../../shared/estimate';
import { compositionFor } from '../../shared/compositions';
import { normName, matchesSearch, searchRank } from '../../shared/names';

const seed: any = (window as any).__SEED || {};
let n = 1;
const id = (p: string) => `${p}${n++}`;
const now = () => new Date().toISOString();
const db: any = {
  estimates: [] as any[], deleted: [] as any[],
  items: STARTER_PRICES.slice(0, seed.items ?? 2000).map((p) => ({ id: id('it'), priceListId: 'pl1', name: p.name, unit: p.unit, type: 'work', category: p.category, price: p.price, costPrice: null, description: compositionFor(p.name)?.join('\n') || null, notes: 'Примерная цена — проверьте и поправьте под свой регион', params: { starter: true }, active: true, priceUpdatedAt: now() })),
};
const me: any = {
  id: 'u1', firstName: 'Олег', companyName: seed.company ?? null, contacts: null, requisites: null, estimatesTotal: seed.estimatesTotal ?? 0, trade: null,
  aiEnabled: false, aiAvailable: false, isAdmin: false, theme: seed.theme, pay: { yookassa: true, receipt: true },
  access: { active: true, mode: 'trial', tier: 'pro', until: new Date(Date.now() + 5 * 864e5).toISOString(), daysLeft: 5, freeEstimateLeft: true, freeLeft: 3, freeLimit: 3, freeEstimateIds: [], paidEstimateIds: [], estimateCount: 0 },
  plan: { tier: 'pro', label: 'Про', aiLimit: 0, aiUsed: 0, extraDesigns: 0, team: null },
  ...(seed.me || {}),
};
const totals = (e: any) => calcEstimate((e.lines || []).map((l: any) => ({ qty: +l.qty, price: +l.price, matPrice: l.matPrice == null ? null : +l.matPrice, coef: l.coef == null ? 1 : +l.coef, costPrice: l.costPrice == null ? null : +l.costPrice, type: l.type, category: l.category })),
  { discountPct: +e.discountPct || 0, markupPct: +e.markupPct || 0, taxPct: +e.taxPct || 0, lossReservePct: +e.lossReservePct || 0, delivery: +e.delivery || 0, extraCosts: +e.extraCosts || 0, roundAdjust: +e.roundAdjust || 0, sectionCoefs: e.sectionCoefs || null });
const view = (e: any) => ({ ...e, totals: totals(e) });
function priced(lines: any[], qtyKnown = false) {
  const own = new Map(db.items.map((i: any) => [i.name.toLowerCase(), i]));
  return lines.map((l, i) => {
    const o: any = own.get(l.name.toLowerCase());
    const approx = o && /^Примерная/.test(o.notes || '');
    const note = o && !approx ? null : o ? 'Примерная цена — проверьте' : l.price ? (l.note || 'Примерная цена — проверьте') : 'Укажите цену';
    return { id: id('l'), position: i, name: l.name, qty: l.qty, unit: o?.unit || l.unit, type: l.type, category: l.category, price: o ? o.price : l.price ?? 0, costPrice: null, catalogItemId: o?.id ?? null, matPrice: null, coef: 1,
      composition: o?.description || l.composition || null, note: qtyKnown ? note : note ? `${note}; количество типовое — уточните` : 'Количество типовое — уточните', unconfirmed: qtyKnown ? Boolean(note) : true };
  });
}
function mk(data: any) {
  const e = { id: id('e'), title: 'Новая смета', customer: null, address: null, date: now(), status: 'draft', projectId: null, project: null, notes: null, paymentTerms: null, validDays: 14, customerDetails: null, workStart: null, workEnd: null, warrantyMonths: 12,
    sectionCoefs: null, paySchedule: null, showVariants: false, discountPct: 0, markupPct: 0, taxPct: 0, lossReservePct: 0, delivery: 0, extraCosts: 0, roundAdjust: 0, isTemplate: false, source: 'manual', createdAt: now(), updatedAt: now(), sharedAt: null, viewedAt: null, approvedAt: null, customerComment: null, paidAt: null, lines: [], ...data };
  db.estimates.unshift(e); me.estimatesTotal++; me.access.estimateCount++;
  return e;
}
(seed.estimates || []).forEach((e: any) => mk({ ...e, lines: (e.lines || []).map((l: any, i: number) => ({ id: id('l'), position: i, coef: 1, matPrice: null, costPrice: null, composition: null, note: null, unconfirmed: false, type: 'work', category: '', ...l })) }));
me.estimatesTotal = seed.estimatesTotal ?? db.estimates.length;

const log: string[] = ((window as any).__API_LOG = []);
function handle(method: string, path: string, q: URLSearchParams, body: any): any {
  const m = (re: RegExp) => path.match(re);
  let r: RegExpMatchArray | null;
  if (path === '/auth/dev' || path === '/auth/telegram') return { token: 't', user: me };
  if (path === '/me') { if (method === 'PATCH') Object.assign(me, body); return me; }
  if (path === '/estimates' && method === 'GET') {
    const tpl = q.get('template') === '1'; const s = (q.get('q') || '').toLowerCase(); const st = q.get('status');
    return db.estimates.filter((e: any) => e.isTemplate === tpl && (!st || e.status === st) && (!s || e.title.toLowerCase().includes(s) || (e.customer || '').toLowerCase().includes(s))).map((e: any) => { const { lines, ...rest } = e; const t = totals(e); return { ...rest, linesCount: lines.length, total: t.total, plannedProfit: t.plannedProfit }; });
  }
  if (path === '/estimates' && method === 'POST') {
    if (body.templateId) { const t = getTemplate(body.templateId)!; return view(mk({ title: body.title || t.title, source: 'template', lines: priced(t.lines as any) })); }
    if (body.quick?.length) return view(mk({ title: body.title, source: 'quick', lines: priced(body.quick.map((l: any) => ({ ...l, type: 'work', category: l.category || '' })), true) }));
    if (body.lines?.length) return view(mk({ title: body.title, source: body.wizard ? 'wizard' : 'manual', customer: body.customer || null, lines: body.lines.map((l: any, i: number) => ({ id: id('l'), position: i, coef: 1, matPrice: null, costPrice: null, composition: null, note: null, unconfirmed: false, category: null, ...l })) }));
    if (body.fromId) { const s = db.estimates.find((e: any) => e.id === body.fromId); return view(mk({ ...s, id: undefined, title: `${s.title} (копия)`, isTemplate: false, lines: s.lines.map((l: any) => ({ ...l, id: id('l') })) })); }
    return view(mk({ title: body.title || 'Новая смета' }));
  }
  if ((r = m(/^\/estimates\/([^/]+)$/))) {
    const e = db.estimates.find((x: any) => x.id === r![1]);
    if (!e) return { __status: 404, error: 'Смета не найдена' };
    if (method === 'GET') return view(e);
    if (method === 'PUT') { const { lines, ...h } = body; Object.assign(e, h, { updatedAt: now(), lines: lines.map((l: any, i: number) => ({ ...l, id: l.id || id('l'), position: i })) }); return view(e); }
    if (method === 'DELETE') { db.estimates = db.estimates.filter((x: any) => x !== e); db.deleted.push(e); return { ok: true }; }
  }
  if ((r = m(/^\/estimates\/([^/]+)\/(.+)$/))) {
    const e = db.estimates.find((x: any) => x.id === r![1]) || db.deleted.find((x: any) => x.id === r![1]); const sub = r[2];
    if (sub === 'lines') { e.lines.push(...body.lines.map((l: any, i: number) => ({ id: id('l'), position: e.lines.length + i, coef: 1, matPrice: null, costPrice: null, composition: null, note: null, unconfirmed: false, ...l }))); return view(e); }
    if (sub === 'restore') { db.estimates.unshift(e); return { ok: true }; }
    if (sub === 'duplicate') return view(mk({ ...e, id: undefined, title: `${e.title} (копия)`, lines: e.lines.map((l: any) => ({ ...l, id: id('l') })) }));
    if (sub === 'save-as-template') return view(mk({ ...e, id: undefined, isTemplate: true, lines: e.lines.map((l: any) => ({ ...l, id: id('l') })) }));
    if (sub === 'share') { e.sharedAt = e.sharedAt || now(); e.status = e.status === 'draft' ? 'sent' : e.status; return { url: `https://smeta.example/s/${e.id}`, sharedAt: e.sharedAt, viewedAt: e.viewedAt, approvedAt: e.approvedAt, customerComment: e.customerComment, status: e.status }; }
    if (sub === 'history') return [];
    if (/link$/.test(sub)) return { url: '/files/x.pdf' };
    return { ok: true, number: 1, ...view(e), changed: 0 };
  }
  if (path === '/items' && method === 'GET') { const s = (q.get('q') || '').trim(); const c = q.get('category'); const r = db.items.filter((i: any) => (!c || i.category === c) && (!s || matchesSearch(i.name, s))); return s ? r.sort((a: any, b: any) => searchRank(b.name, s) - searchRank(a.name, s)) : r; }
  if (path === '/items' && method === 'POST') { const it = { id: id('it'), active: true, notes: null, params: null, costPrice: null, description: null, priceUpdatedAt: now(), ...body }; db.items.unshift(it); return it; }
  if ((r = m(/^\/items\/(it\d+)$/))) { const it = db.items.find((x: any) => x.id === r![1]); if (method === 'PATCH') { const ch = body.price != null && +body.price !== +it.price; Object.assign(it, body, { priceUpdatedAt: now() }); if (ch) { it.params = { ...(it.params || {}), starter: false }; it.notes = null; } } if (method === 'DELETE') db.items = db.items.filter((x: any) => x !== it); return method === 'GET' ? { ...it, history: [] } : it; }
  if (path === '/items/bulk-upsert') { let created = 0, updated = 0; const ids: any = {}; for (const it of body.items) { const ex = db.items.find((x: any) => normName(x.name) === normName(it.name)); if (ex) { ex.price = it.price; ex.notes = null; ex.params = it.matPrice ? { matPrice: it.matPrice } : ex.params; updated++; ids[normName(it.name)] = ex.id; } else { const c = { id: id('it'), priceListId: 'pl1', active: true, notes: null, costPrice: null, description: it.composition, params: it.matPrice ? { matPrice: it.matPrice } : null, priceUpdatedAt: now(), ...it, category: it.category || 'Прочее' }; db.items.unshift(c); created++; ids[normName(it.name)] = c.id; } } return { created, updated, same: 0, ids }; }
  if (path === '/items/region') return { region: 'spb', coef: 1, regions: [] };
  if (path === '/pricelists') return [{ id: 'pl1', name: 'Мои расценки', isDefault: true, itemsCount: db.items.length }];
  if (path === '/categories') return [...new Set(db.items.map((i: any) => i.category))];
  if (path === '/calendar') return { month: q.get('month'), total: { earned: seed.earned ?? 0, income: 0, expense: 0 }, days: [] };
  if (path === '/finance/summary') return { activeCount: 0, projects: [] };
  if (path === '/plans') return [];
  if (path === '/templates') return TEMPLATES.map((t) => ({ id: t.id, title: t.title, description: t.description, lines: t.lines.length }));
  if (path === '/materials/search') return { items: [], total: 0 };
  if (path === '/ev') return { ok: true };
  if (method === 'GET') return [];
  return { ok: true };
}
const real = window.fetch.bind(window);
window.fetch = async (input: any, init: any = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (!url.pathname.startsWith('/api/')) return real(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : undefined;
  let out: any;
  try { out = handle(method, url.pathname.slice(4), url.searchParams, body); } catch (e: any) { console.error('MOCK FAIL', method, url.pathname, e); out = { __status: 500, error: String(e?.message || e) }; }
  log.push(`${method} ${url.pathname}${url.search}`);
  await new Promise((r) => setTimeout(r, 15));
  const status = out?.__status || 200;
  return new Response(JSON.stringify(out), { status, headers: { 'Content-Type': 'application/json' } });
};
