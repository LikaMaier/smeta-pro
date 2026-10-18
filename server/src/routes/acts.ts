import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, plain, notFound, audit, num, HttpError, accessOf, docsOk, needDocs } from '../util';
import { loadEstimate, estimateTotals, estimateNumber } from './estimates';
import { pdfData, renderPdf, renderKs, signedPath, checkSig, fileName } from '../pdf';
import { progress, buildAct, lineKey, priceFactor, ActItem } from '../../../shared/acts';
import { payStages } from '../../../shared/payments';
import { brandPath } from '../brand';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Реквизиты исполнителя одной строкой: «ИП Петров И. С., ИНН …, ОГРНИП …, адрес» */
export function reqLine(user: any) {
  const r = (user.requisites || {}) as any;
  const name = r.name || user.companyName || [user.firstName, user.username ? `@${user.username}` : ''].filter(Boolean).join(' ');
  const og = r.ogrn ? `${String(r.ogrn).length === 15 ? 'ОГРНИП' : 'ОГРН'} ${r.ogrn}` : '';
  return [name, r.inn ? `ИНН ${r.inn}` : '', r.kpp ? `КПП ${r.kpp}` : '', og, r.address || ''].filter(Boolean).join(', ');
}
/** Следующий номер документа (счёт, акт скрытых работ): счётчик в AppKV */
async function nextNo(key: string) {
  const cur = await prisma.appKV.findUnique({ where: { key } });
  const n = (Number(cur?.value) || 0) + 1;
  await prisma.appKV.upsert({ where: { key }, create: { key, value: String(n) }, update: { value: String(n) } });
  return n;
}
const DOCS = ['ks6a', 'aosr', 'invoice'] as const;
type Doc = typeof DOCS[number];
const docParams = z.object({
  line: z.coerce.number().int().min(0).max(5000).optional(), from: z.string().regex(DAY).optional(), to: z.string().regex(DAY).optional(),
  next: z.string().max(300).optional(), project: z.string().max(300).optional(),
  stage: z.coerce.number().int().min(-1).max(20).optional(), amount: z.coerce.number().min(0).max(1e10).optional(), number: z.string().max(20).optional(),
});

/**
 * Акты выполненных работ по смете (в т.ч. промежуточные) и формы КС-2, КС-3.
 * Только по подписке.
 */
const FORMS = ['act', 'ks2', 'ks3'] as const;
type Form = typeof FORMS[number];

function estimateRows(e: any) {
  const t = estimateTotals(e);
  const lines = e.lines.map((l: any, i: number) => ({
    key: lineKey(l), name: l.name, unit: l.unit, qty: num(l.qty), amount: t.lineAmounts[i], category: l.category, composition: l.composition,
  }));
  return { t, lines, k: priceFactor(t.subtotal, t.total - t.tax) };
}

const paidOnly = (user: any) => {
  needDocs(user);
};

async function actsOf(estimateId: string) {
  return prisma.workAct.findMany({ where: { estimateId, deletedAt: null }, orderBy: { number: 'asc' } });
}

async function loadAct(userId: string, id: string) {
  const a = await prisma.workAct.findFirst({ where: { id, userId, deletedAt: null } });
  if (!a) throw notFound('Акт');
  return a;
}

/** Данные документа по акту */
async function actDoc(act: any, user: any, form: Form) {
  const e = await loadEstimate(act.userId, act.estimateId);
  const { t, lines } = estimateRows(e);
  const items = act.items as ActItem[];
  const taxPct = num(e.taxPct);
  const estNo = await estimateNumber(act.userId, e);
  const pos = new Map<string, number>();
  lines.forEach((l: any, i: number) => { if (!pos.has(l.key)) pos.set(l.key, i + 1); });
  const comp = new Map(lines.map((l: any) => [l.key, l.composition]));
  const sum = (its: ActItem[]) => {
    const subtotal = Math.round(its.reduce((a, i) => a + i.amount, 0) * 100) / 100;
    const tax = Math.round(subtotal * taxPct) / 100;
    return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  };
  const base = {
    company: reqLine(user),
    contacts: (user.requisites as any)?.inn ? '' : user.contacts || '', customer: e.customer, customerDetails: e.customerDetails || '', title: e.title, address: e.address,
    number: String(act.number), date: new Date(act.date).toISOString().slice(0, 10),
    periodFrom: act.periodFrom ? new Date(act.periodFrom).toISOString().slice(0, 10) : null,
    contractNo: String(estNo), taxPct, estimateTotal: t.total,
  };
  if (form === 'ks2') {
    return { ...base, form, items: items.map((i) => ({ ...i, pos: pos.get(i.key) || '' })), ...sum(items) };
  }
  if (form === 'ks3') {
    const all = await actsOf(act.estimateId);
    const upTo = all.filter((a) => a.number <= act.number);
    const year = new Date(act.date).getUTCFullYear();
    const inYear = upTo.filter((a) => new Date(a.date).getUTCFullYear() === year);
    const flat = (as: any[]) => as.flatMap((a) => a.items as ActItem[]);
    const bySection = (its: ActItem[]) => {
      const m = new Map<string, number>();
      its.forEach((i) => m.set(i.category || 'Работы', (m.get(i.category || 'Работы') || 0) + i.amount));
      return m;
    };
    const cum = bySection(flat(upTo)), yr = bySection(flat(inYear)), per = bySection(items);
    const names = [...new Set([...cum.keys()])];
    return {
      ...base, form, cum: sum(flat(upTo)), year: sum(flat(inYear)), period: sum(items),
      sections: names.map((n) => ({ name: n, cum: cum.get(n) || 0, year: yr.get(n) || 0, period: per.get(n) || 0 })),
    };
  }
  // обычный акт в стиле сметы
  const d: any = pdfData(e, user, estNo, !accessOf(user).active);
  const s = sum(items);
  Object.assign(d, {
    docType: 'act', number: String(act.number), estimateNumber: String(estNo), actDate: base.date, periodFrom: base.periodFrom,
    split: false, stages: [], paid: null, actTotal: s.total, grouped: items.some((i) => i.category),
    lines: items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.unitPrice, amount: i.amount, category: i.category,
      composition: String(comp.get(i.key) || '').split('\n').map((x) => x.replace(/^[-–•\s]+/, '').trim()).filter(Boolean) })),
    totals: { subtotal: s.subtotal, tax: s.tax, taxPct, total: s.total, totalLabel: 'Итого по акту' },
  });
  return d;
}

async function render(act: any, user: any, form: Form) {
  const data = await actDoc(act, user, form);
  const buf = form === 'act' ? await renderPdf(data) : await renderKs(data);
  const label = form === 'act' ? `Акт ${act.number}` : form === 'ks2' ? `КС-2 № ${act.number}` : `КС-3 № ${act.number}`;
  return { buf, name: fileName(`${label} — ${data.title || ''}`, 'pdf') };
}

export async function actRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  app.get('/api/estimates/:id/acts', async (req) => {
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    const { t, lines, k } = estimateRows(e);
    const acts = await actsOf(e.id);
    const rows = progress(lines, acts.map((a) => ({ items: a.items as any })), k);
    return plain({
      estimate: { id: e.id, title: e.title, total: t.total, taxPct: num(e.taxPct) },
      rows, acts: acts.map((a) => ({ id: a.id, number: a.number, date: a.date, periodFrom: a.periodFrom, subtotal: a.subtotal, total: a.total, items: (a.items as any[]).length })),
      doneTotal: Math.round(acts.reduce((s, a) => s + num(a.total), 0) * 100) / 100,
    });
  });

  app.post('/api/estimates/:id/acts', async (req) => {
    paidOnly(req.user);
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    const body = z.object({
      date: z.string().regex(DAY).optional(), periodFrom: z.string().regex(DAY).nullable().optional(),
      items: z.record(z.string().max(400), z.coerce.number().min(0).max(1e9)),
    }).parse(req.body);
    const { lines, k } = estimateRows(e);
    const acts = await actsOf(e.id);
    const rows = progress(lines, acts.map((a) => ({ items: a.items as any })), k);
    const a = buildAct(rows, body.items, num(e.taxPct));
    if (!a.items.length) throw new HttpError(400, 'Отметьте выполненные объёмы хотя бы по одной позиции');
    const number = (acts.reduce((m, x) => Math.max(m, x.number), 0) || 0) + 1;
    const act = await prisma.workAct.create({
      data: {
        userId: req.user.id, estimateId: e.id, number, items: a.items as any, subtotal: a.subtotal, total: a.total,
        date: body.date ? new Date(`${body.date}T12:00:00.000Z`) : new Date(),
        periodFrom: body.periodFrom ? new Date(`${body.periodFrom}T12:00:00.000Z`) : null,
      },
    });
    await audit(req.user.id, 'estimate', e.id, 'act_create', { number, total: a.total });
    return plain(act);
  });

  app.delete('/api/acts/:id', async (req) => {
    const a = await loadAct(req.user.id, (req.params as any).id);
    await prisma.workAct.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  app.post('/api/acts/:id/send/:form', async (req) => {
    paidOnly(req.user);
    const form = z.enum(FORMS).parse((req.params as any).form);
    const a = await loadAct(req.user.id, (req.params as any).id);
    if (!opts.bot) throw new HttpError(503, 'Бот не подключён — отправить файл в чат нельзя', 'bot_not_configured');
    const f = await render(a, req.user, form);
    const { InputFile } = await import('grammy');
    const cap = form === 'act' ? `Акт № ${a.number} на ${num(a.total).toLocaleString('ru-RU')} ₽. Распечатайте в 2 экземплярах и подпишите с заказчиком.`
      : form === 'ks2' ? `КС-2 № ${a.number} (акт о приёмке выполненных работ). Заполните коды ОКПО и должности, если заказчику нужно.`
      : `КС-3 № ${a.number} (справка о стоимости работ и затрат) — подаётся вместе с КС-2.`;
    await opts.bot.api.sendDocument(Number(req.user.tgId), new InputFile(f.buf, f.name), { caption: cap });
    return { ok: true };
  });

  app.get('/api/acts/:id/link/:form', async (req) => {
    paidOnly(req.user);
    const form = z.enum(FORMS).parse((req.params as any).form);
    const a = await loadAct(req.user.id, (req.params as any).id);
    return { url: signedPath(`/files/acts/${a.id}.pdf`, `act-${form}`, a.id) };
  });

  // ---- Документы по смете: журнал КС-6а, акт освидетельствования скрытых работ, счёт на оплату ----
  async function estDoc(e: any, user: any, kind: Doc, p: z.infer<typeof docParams>) {
    const today = new Date().toISOString().slice(0, 10);
    const estNo = await estimateNumber(e.userId, e);
    const base = { form: kind, company: reqLine(user), contacts: user.contacts || '', customer: e.customer, customerDetails: e.customerDetails || '', title: e.title, address: e.address, date: today, contractNo: String(estNo) };
    const { t, lines } = estimateRows(e);
    if (kind === 'ks6a') {
      const acts = await actsOf(e.id);
      const rows = lines.map((l: any) => {
        const price = l.qty ? Math.round((l.amount / l.qty) * 100) / 100 : 0;
        const byAct = acts.map((a) => { const it = (a.items as ActItem[]).filter((i) => i.key === l.key); return { qty: it.reduce((s, i) => s + i.qty, 0), amount: Math.round(it.reduce((s, i) => s + i.amount, 0) * 100) / 100 }; });
        return { name: l.name, unit: l.unit, price, qty: l.qty, amount: l.amount, byAct, doneQty: Math.round(byAct.reduce((s, x) => s + x.qty, 0) * 1000) / 1000, doneAmount: Math.round(byAct.reduce((s, x) => s + x.amount, 0) * 100) / 100 };
      }).filter((r: any) => r.amount > 0);
      const shown = acts.slice(-6); // в ширину листа помещается 6 актов
      return { ...base, number: String(acts.length || 1), periodTo: today, estimateSubtotal: t.subtotal, doneSubtotal: Math.round(acts.reduce((s, a) => s + num(a.subtotal), 0) * 100) / 100,
        acts: shown.map((a) => ({ number: String(a.number), date: new Date(a.date).toISOString().slice(0, 10), subtotal: num(a.subtotal) })),
        rows: rows.map((r: any) => ({ ...r, byAct: r.byAct.slice(-6) })) };
    }
    if (kind === 'aosr') {
      const l = e.lines[p.line ?? 0];
      if (!l) throw new HttpError(400, 'Выберите скрытую работу из сметы');
      const mats = e.lines.filter((x: any) => x.type === 'material' && (x.category || '').replace(/: материалы$/, '') === (l.category || '')).map((x: any) => x.name);
      const number = p.number || String(await nextNo(`aosr:${e.id}`));
      return { ...base, contractor: reqLine(user), number, work: `${l.name} — ${String(num(l.qty)).replace('.', ',')} ${l.unit}`, materials: mats.slice(0, 8).join('; '),
        from: p.from || null, to: p.to || today, next: p.next || '', project: p.project || '' };
    }
    // счёт на оплату: весь итог, этап графика оплат или своя сумма
    const r = (user.requisites || {}) as any;
    if (!r.inn || !r.rs || !r.bik) throw new HttpError(400, 'Заполните реквизиты для счёта в Настройках: ИНН, банк, БИК и расчётный счёт', 'requisites_required');
    const schedule = Array.isArray(e.paySchedule) ? e.paySchedule : null;
    const stages = schedule ? payStages(t.total, schedule) : [];
    const st = p.stage != null && p.stage >= 0 ? stages[p.stage] : null;
    const amount = Math.round((p.amount || (st ? st.amount : t.total)) * 100) / 100;
    const what = st ? `${st.title} (${st.pct}%)` : p.amount ? 'Оплата' : 'Оплата работ';
    const vatPct = r.vat ? num(e.taxPct) : 0;
    const tax = vatPct ? Math.round((amount * vatPct / (100 + vatPct)) * 100) / 100 : 0;
    const number = p.number || String(await nextNo(`inv:${user.id}`));
    return { ...base, number, req: r, basis: `Договор подряда № ${estNo}, смета № ${estNo} «${e.title}»`,
      items: [{ name: `${what} по договору подряда № ${estNo}: ${e.title}`, qty: 1, unit: 'усл.', price: amount, amount }],
      subtotal: amount, tax, taxPct: vatPct, vatIncluded: Boolean(vatPct), total: amount, signPath: brandPath(user.signFile),
      note: 'Оплата по счёту означает согласие с условиями договора. Уведомление об оплате обязательно.' };
  }
  const docName = (kind: Doc, d: any) => fileName(`${kind === 'ks6a' ? 'КС-6а' : kind === 'aosr' ? `Акт скрытых работ № ${d.number}` : `Счёт № ${d.number}`} — ${d.title || ''}`, 'pdf');

  app.post('/api/estimates/:id/doc/:kind/send', async (req) => {
    needDocs(req.user);
    const kind = z.enum(DOCS).parse((req.params as any).kind);
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    if (!opts.bot) throw new HttpError(503, 'Бот не подключён — отправить файл в чат нельзя', 'bot_not_configured');
    const d = await estDoc(e, req.user, kind, docParams.parse(req.body || {}));
    const buf = await renderKs(d);
    const { InputFile } = await import('grammy');
    const cap = kind === 'ks6a' ? 'Журнал учёта выполненных работ КС-6а: все позиции сметы и объёмы по актам нарастающим итогом.'
      : kind === 'aosr' ? `Акт освидетельствования скрытых работ № ${d.number}. Впишите представителей сторон, распечатайте и подпишите до того, как работы закроют следующим слоем.`
      : `Счёт на оплату № ${d.number} на ${num(d.total).toLocaleString('ru-RU')} ₽ — перешлите заказчику.`;
    await opts.bot.api.sendDocument(Number(req.user.tgId), new InputFile(buf, docName(kind, d)), { caption: cap });
    await audit(req.user.id, 'estimate', e.id, `doc_${kind}`, { number: d.number });
    return { ok: true, number: d.number };
  });

  app.get('/api/estimates/:id/doc/:kind/link', async (req) => {
    needDocs(req.user);
    const kind = z.enum(DOCS).parse((req.params as any).kind);
    const e = await loadEstimate(req.user.id, (req.params as any).id);
    const p = docParams.parse(req.query || {});
    if (kind === 'invoice') {
      const r = (req.user as any).requisites || {};
      if (!r.inn || !r.rs || !r.bik) throw new HttpError(400, 'Заполните реквизиты для счёта в Настройках: ИНН, банк, БИК и расчётный счёт', 'requisites_required');
    }
    // номер выдаём сразу, чтобы при открытии ссылки он не менялся
    if (kind === 'invoice' && !p.number) p.number = String(await nextNo(`inv:${req.user.id}`));
    if (kind === 'aosr' && !p.number) p.number = String(await nextNo(`aosr:${e.id}`));
    const extra = Buffer.from(JSON.stringify(p)).toString('base64url');
    return { url: `${signedPath(`/files/docs/${e.id}.pdf`, `doc-${kind}`, e.id)}&p=${extra}` };
  });

  app.get('/files/docs/:file', async (req, reply) => {
    const id = String((req.params as any).file).replace(/\.pdf$/, '');
    const { kind, exp, sig, p } = req.query as any;
    const k = String(kind || '').replace(/^doc-/, '') as Doc;
    if (!DOCS.includes(k) || !checkSig(`doc-${k}`, id, exp, sig)) return reply.status(403).send({ error: 'Ссылка устарела, откройте документ из приложения заново' });
    const e = await prisma.estimate.findFirst({ where: { id, deletedAt: null }, include: { lines: { orderBy: { position: 'asc' } }, user: true } });
    if (!e) return reply.status(404).send({ error: 'Смета не найдена' });
    if (!docsOk(e.user)) return reply.status(402).send({ error: 'Доступно в тарифе «Про»' });
    let params = {};
    try { params = docParams.parse(JSON.parse(Buffer.from(String(p || ''), 'base64url').toString() || '{}')); } catch { /* без параметров */ }
    const d = await estDoc(e, e.user, k, params);
    const buf = await renderKs(d);
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(docName(k, d))}`).send(buf);
  });

  app.get('/files/acts/:file', async (req, reply) => {
    const id = String((req.params as any).file).replace(/\.pdf$/, '');
    const { kind, exp, sig } = req.query as any;
    const form = String(kind || '').replace(/^act-/, '') as Form;
    if (!FORMS.includes(form) || !checkSig(`act-${form}`, id, exp, sig)) return reply.status(403).send({ error: 'Ссылка устарела, откройте документ из приложения заново' });
    const a = await prisma.workAct.findFirst({ where: { id, deletedAt: null }, include: { user: true } });
    if (!a) return reply.status(404).send({ error: 'Акт не найден' });
    if (!docsOk(a.user)) return reply.status(402).send({ error: 'Доступно в тарифе «Про»' });
    const f = await render(a, a.user, form);
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`).send(f.buf);
  });
}
