import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ShopLink from '../components/ShopLink';
import { materialVariants, currentTier } from '../../../shared/materialTiers';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post, put, del } from '../api';
import { calcEstimate } from '../../../shared/estimate';
import { checkEstimate } from '../../../shared/estimateCheck';
import { payStages, DEFAULT_SCHEDULE } from '../../../shared/payments';
import { useMe } from '../App';
import { Field, Fold, Icon, Load, NumInput, SearchBox, Sheet, State, useDebounced, useLoad, useToast } from '../components/ui';
import { rub, n, pct, date, dateInput, parseNum, EST_STATUS, TYPE_LABEL, UNITS } from '../format';
import { confirmDialog, haptic, tg } from '../tg';
import { normName } from '../../../shared/names';

type L = { k: string; id?: string; name: string; qty: string; unit: string; price: string; matPrice: string; coef: string; composition: string; costPrice: string; type: string; category: string; note: string; catalogItemId?: string | null; unconfirmed?: boolean };
type H = { title: string; customer: string; address: string; date: string; status: string; projectId: string | null; notes: string; paymentTerms: string; validDays: string; customerDetails: string; workStart: string; workEnd: string; warrantyMonths: string;
  sectionCoefs: Record<string, number>; paySchedule: { title: string; pct: string }[];
  discountPct: string; markupPct: string; taxPct: string; lossReservePct: string; delivery: string; extraCosts: string; roundAdjust: string };

let seq = 0;
const key = () => `l${Date.now()}_${seq++}`;
const toL = (l: any): L => ({ k: key(), id: l.id, name: l.name, qty: String(l.qty ?? ''), unit: l.unit || 'шт', price: String(l.price ?? ''), matPrice: l.matPrice == null || Number(l.matPrice) === 0 ? '' : String(l.matPrice), coef: l.coef == null || Number(l.coef) === 1 ? '' : String(l.coef), composition: l.composition || '', costPrice: l.costPrice == null ? '' : String(l.costPrice), type: l.type || 'work', category: l.category || '', note: l.note || '', catalogItemId: l.catalogItemId, unconfirmed: l.unconfirmed });
const toH = (e: any): H => ({ title: e.title, customer: e.customer || '', address: e.address || '', date: dateInput(e.date), status: e.status, projectId: e.projectId, notes: e.notes || '', paymentTerms: e.paymentTerms || '', validDays: String(e.validDays ?? 14),
  customerDetails: e.customerDetails || '', workStart: e.workStart ? dateInput(e.workStart) : '', workEnd: e.workEnd ? dateInput(e.workEnd) : '', warrantyMonths: String(e.warrantyMonths ?? 12),
  sectionCoefs: (e.sectionCoefs && typeof e.sectionCoefs === 'object' ? e.sectionCoefs : {}), paySchedule: Array.isArray(e.paySchedule) ? e.paySchedule.map((x: any) => ({ title: x.title, pct: String(x.pct) })) : [],
  discountPct: String(e.discountPct || 0), markupPct: String(e.markupPct || 0), taxPct: String(e.taxPct || 0), lossReservePct: String(e.lossReservePct || 0), delivery: String(e.delivery || 0), extraCosts: String(e.extraCosts || 0), roundAdjust: String(e.roundAdjust || 0) });
const payload = (h: H, lines: L[]) => ({
  title: h.title.trim() || 'Без названия', customer: h.customer || null, address: h.address || null, date: h.date || undefined, status: h.status, projectId: h.projectId || null, notes: h.notes || null,
  paymentTerms: h.paymentTerms || null, validDays: Math.max(1, Math.round(parseNum(h.validDays)) || 14),
  customerDetails: h.customerDetails || null, workStart: h.workStart || null, workEnd: h.workEnd || null, warrantyMonths: Math.max(0, Math.min(120, Math.round(parseNum(h.warrantyMonths)))),
  sectionCoefs: Object.keys(h.sectionCoefs).length ? h.sectionCoefs : null,
  paySchedule: h.paySchedule.filter((x) => x.title.trim() && parseNum(x.pct) > 0).length ? h.paySchedule.filter((x) => x.title.trim() && parseNum(x.pct) > 0).map((x) => ({ title: x.title.trim(), pct: parseNum(x.pct) })) : null,
  discountPct: parseNum(h.discountPct), markupPct: parseNum(h.markupPct), taxPct: parseNum(h.taxPct), lossReservePct: parseNum(h.lossReservePct), delivery: parseNum(h.delivery), extraCosts: parseNum(h.extraCosts), roundAdjust: parseNum(h.roundAdjust),
  lines: lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), qty: parseNum(l.qty), unit: l.unit || 'шт', price: parseNum(l.price), matPrice: l.matPrice === '' ? null : parseNum(l.matPrice), coef: l.coef === '' ? 1 : (parseNum(l.coef) > 0 ? parseNum(l.coef) : 1), composition: l.composition.trim() || null, costPrice: l.costPrice === '' ? null : parseNum(l.costPrice), type: l.type, category: l.category || null, note: l.note || null, catalogItemId: l.catalogItemId || null, unconfirmed: Boolean(l.unconfirmed) })),
});
const draftKey = (id: string) => `smeta_draft_${id}`;

export default function EstimateEditor() {
  const { id } = useParams();
  const state = useLoad(() => get(`/estimates/${id}`), [id]);
  return <Load state={state}>{(e) => <Editor key={e.id} initial={e} reload={state.reload} />}</Load>;
}

function Editor({ initial, reload }: { initial: any; reload: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { me } = useMe();
  const readOnly = !me.access.active && !(me.access.freeEstimateIds || []).includes(initial.id);
  const [h, setH] = useState<H>(() => toH(initial));
  const [lines, setLines] = useState<L[]>(() => initial.lines.map(toL));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [sheet, setSheet] = useState<null | 'head' | 'params' | 'add' | 'more' | 'history' | 'line' | 'share' | 'contract' | 'pay' | 'check' | 'prices'>(null);
  const [share, setShare] = useState<any>(() => ({ url: null, sharedAt: initial.sharedAt, viewedAt: initial.viewedAt, approvedAt: initial.approvedAt, customerComment: initial.customerComment }));
  const [editLine, setEditLine] = useState<string | null>(null);
  const [secEdit, setSecEdit] = useState<string | null>(null);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [raise, setRaise] = useState({ pct: '', scope: 'all' });
  const [grouped, setGrouped] = useState(() => initial.lines.some((l: any) => l.category));
  const [restore, setRestore] = useState<any>(null);
  const saving = useRef(false);
  // из «Новой сметы → Другое»: сразу поиск по справочнику
  useEffect(() => { if (new URLSearchParams(location.search).get('add') === '1' && !initial.lines.length) setSheet('add'); }, []); // eslint-disable-line

  // Восстановление незавершённого ввода
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(initial.id));
      if (raw) {
        const d = JSON.parse(raw);
        if (d.at > new Date(initial.updatedAt).getTime()) setRestore(d); else localStorage.removeItem(draftKey(initial.id));
      }
    } catch { /* */ }
  }, [initial.id, initial.updatedAt]);

  const change = useCallback(() => setDirty(true), []);
  const setHead = (patch: Partial<H>) => { setH((x) => ({ ...x, ...patch })); change(); };
  const setLine = (k: string, patch: Partial<L>) => { setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...patch } : l))); change(); };

  // ---- Мои расценки: справочник для подстановки и «запомнить цены из сметы»
  const cat = useLoad(() => get<any[]>('/items').catch(() => []), []);
  const catMap = useMemo(() => new Map((cat.data || []).map((i: any) => [normName(i.name), i])), [cat.data]);
  const itemMat = (i: any) => (Number(i?.params?.matPrice) > 0 ? Number(i.params.matPrice) : null);
  /** Ввели название, которое есть в справочнике, — подставляем свою цену (если цена ещё не указана) */
  const setName = (l: L, name: string) => {
    const it: any = catMap.get(normName(name));
    if (it && (!l.price || parseNum(l.price) === 0)) {
      const m = itemMat(it);
      setLine(l.k, { name, unit: it.unit, price: String(it.price), matPrice: m ? String(m) : l.matPrice, type: it.type, category: l.category || it.category,
        costPrice: it.costPrice == null ? '' : String(it.costPrice), composition: l.composition || it.description || '', catalogItemId: it.id });
      haptic('light');
    } else setLine(l.k, { name });
  };
  /** Позиции, цены которых отличаются от справочника или которых в нём нет */
  const fresh = useMemo(() => {
    if (!cat.data) return [];
    const seen = new Set<string>();
    return lines.filter((l) => {
      const key = normName(l.name);
      if (!l.name.trim() || seen.has(key) || (parseNum(l.price) <= 0 && parseNum(l.matPrice) <= 0)) return false;
      seen.add(key);
      const it: any = catMap.get(key);
      const mat = l.matPrice === '' || parseNum(l.matPrice) <= 0 ? null : parseNum(l.matPrice);
      return !it || Number(it.price) !== parseNum(l.price) || itemMat(it) !== mat;
    }).map((l) => ({ l, it: catMap.get(normName(l.name)) as any }));
  }, [lines, catMap, cat.data]);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const savePrices = async () => {
    const pick = fresh.filter((x) => !skip.has(x.l.k));
    if (!pick.length) return toast('Ничего не выбрано', true);
    try {
      const r = await post<any>('/items/bulk-upsert', { items: pick.map(({ l }) => ({
        name: l.name.trim(), unit: l.unit || 'шт', type: l.type, category: l.category || null, price: parseNum(l.price),
        composition: l.composition.trim() || null, matPrice: l.matPrice === '' ? null : parseNum(l.matPrice),
      })) });
      // связываем строки со справочником — потом их можно обновлять кнопкой «Обновить цены»
      setLines((ls) => ls.map((l) => { const id = r.ids?.[normName(l.name)]; return id && !l.catalogItemId ? { ...l, catalogItemId: id } : l; }));
      change(); cat.reload(); setSkip(new Set()); setSheet(null); haptic('success');
      toast(`Запомнено: ${[r.created ? `новых ${r.created}` : '', r.updated ? `обновлено ${r.updated}` : ''].filter(Boolean).join(', ') || 'без изменений'}. Цены подставятся в новые сметы`);
    } catch (e: any) { toast(e.message, true); }
  };

  // Локальная копия на случай закрытия приложения
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(draftKey(initial.id), JSON.stringify({ at: Date.now(), h, lines })); } catch { /* */ }
  }, [h, lines, dirty, initial.id]);

  const save = useCallback(async () => {
    if (saving.current || readOnly) return;
    saving.current = true;
    setSaveState('saving');
    try {
      await put(`/estimates/${initial.id}`, payload(h, lines));
      setDirty(false);
      setSaveState('saved');
      try { localStorage.removeItem(draftKey(initial.id)); } catch { /* */ }
    } catch (e: any) {
      setSaveState('error');
      if (e.code !== 'subscription_required') toast(e.message, true);
    } finally { saving.current = false; }
  }, [h, lines, initial.id, readOnly, toast]);

  // Автосохранение через 1,2 с после последнего изменения
  const debounced = useDebounced({ h, lines }, 1200);
  useEffect(() => { if (dirty) save(); /* eslint-disable-next-line */ }, [debounced]);

  const totals = useMemo(() => calcEstimate(
    lines.map((l) => ({ qty: parseNum(l.qty), price: parseNum(l.price), matPrice: l.matPrice === '' ? null : parseNum(l.matPrice), coef: l.coef === '' ? 1 : parseNum(l.coef), costPrice: l.costPrice === '' ? null : parseNum(l.costPrice), type: l.type, category: l.category })),
    { discountPct: parseNum(h.discountPct), markupPct: parseNum(h.markupPct), taxPct: parseNum(h.taxPct), lossReservePct: parseNum(h.lossReservePct), delivery: parseNum(h.delivery), extraCosts: parseNum(h.extraCosts), roundAdjust: parseNum(h.roundAdjust), sectionCoefs: h.sectionCoefs },
  ), [lines, h]);

  /** Подобрать скидку так, чтобы итог стал ровно target (налог начисляется сверху) */
  const roundTo = (target: number) => {
    const before = totals.total - totals.roundAdjust;
    setHead({ roundAdjust: String(Math.round((target - before) * 100) / 100) });
    toast(`Итог: ${rub(target)} (округление ${rub(target - before)})`);
  };

  const move = (k: string, dir: -1 | 1) => {
    setLines((ls) => { const i = ls.findIndex((l) => l.k === k); const j = i + dir; if (j < 0 || j >= ls.length) return ls; const c = [...ls]; [c[i], c[j]] = [c[j], c[i]]; return c; });
    change();
  };
  const duplicate = (k: string) => { setLines((ls) => { const i = ls.findIndex((l) => l.k === k); const c = [...ls]; c.splice(i + 1, 0, { ...ls[i], k: key(), id: undefined }); return c; }); change(); };
  const remove = async (k: string) => {
    const l = lines.find((x) => x.k === k);
    if (l?.name && !(await confirmDialog(`Удалить позицию «${l.name}»?`))) return;
    setLines((ls) => ls.filter((x) => x.k !== k)); change(); setSheet(null);
  };
  const addLines = (ls: Partial<L>[]) => {
    setLines((cur) => [...cur, ...ls.map((l) => ({ k: key(), name: '', qty: '1', unit: 'шт', price: '0', matPrice: '', coef: '', composition: '', costPrice: '', type: 'work', category: '', note: '', ...l }))]);
    change(); haptic('light');
  };

  const [pdfBusy, setPdfBusy] = useState(false);
  const FILE_OK: Record<string, string> = {
    pdf: 'PDF отправлен вам в чат бота — перешлите заказчику',
    act: 'Акт отправлен вам в чат бота — распечатайте и подпишите с заказчиком',
    contract: 'Договор отправлен вам в чат бота — проверьте условия и подпишите с заказчиком',
    xlsx: 'Excel отправлен вам в чат бота',
    xlsxown: 'Excel «для себя» отправлен вам в чат бота — заказчику его не пересылайте',
  };
  const sendFile = async (kind: 'pdf' | 'act' | 'contract' | 'xlsx' | 'xlsxown') => {
    setPdfBusy(true);
    try { if (dirty) await save(); await post(`/estimates/${initial.id}/file/${kind}/send`); haptic('success'); toast(FILE_OK[kind]); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setPdfBusy(false); }
  };
  const issues = useMemo(() => checkEstimate({
    title: h.title, customer: h.customer, address: h.address, total: totals.total,
    lines: lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name, qty: parseNum(l.qty), price: parseNum(l.price), matPrice: l.matPrice === '' ? null : parseNum(l.matPrice), unit: l.unit, note: l.note, unconfirmed: l.unconfirmed })),
    paySchedule: h.paySchedule.filter((x) => x.title.trim()).map((x) => ({ title: x.title, pct: parseNum(x.pct) })),
  }), [h, lines, totals.total]);
  /** Перед отправкой заказчику — проверка; при замечаниях показываем их и даём отправить всё равно */
  const guard = (fn: () => void) => { if (issues.length) { setPending(() => fn); setSheet('check'); } else fn(); };
  const sendPdf = () => guard(() => sendFile('pdf'));
  const openFile = async (kind: 'pdf' | 'act' | 'contract') => {
    setPdfBusy(true);
    try {
      if (dirty) await save();
      const { url } = await get(`/estimates/${initial.id}/file/${kind}/link`);
      const full = new URL(url, location.origin).toString();
      if (tg?.openLink) tg.openLink(full); else window.open(full, '_blank');
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setPdfBusy(false); }
  };
  const openPdf = () => openFile('pdf');

  const openShare = async () => {
    setPdfBusy(true);
    try {
      if (dirty) await save();
      const r = await post(`/estimates/${initial.id}/share`);
      setShare(r); setH((x) => ({ ...x, status: r.status || x.status })); setSheet('share');
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setPdfBusy(false); }
  };

  const action = async (fn: () => Promise<any>, ok?: string) => {
    try { if (dirty) await save(); await fn(); if (ok) toast(ok); } catch (e: any) { toast(e.message, true); }
  };

  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const order = useMemo(() => {
    if (!grouped) return [{ cat: null as string | null, items: lines }];
    const m = new Map<string, L[]>();
    lines.forEach((l) => { const c = l.category || 'Без раздела'; m.set(c, [...(m.get(c) || []), l]); });
    return [...m.entries()].map(([cat, items]) => ({ cat, items }));
  }, [lines, grouped]);
  const idx = new Map(lines.map((l, i) => [l.k, i]));
  const current = lines.find((l) => l.k === editLine);

  return (
    <>
      {restore && (
        <div className="banner">
          Найден несохранённый ввод от {new Date(restore.at).toLocaleString('ru-RU')}.
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm primary" onClick={() => { setH(restore.h); setLines(restore.lines); setDirty(true); setRestore(null); }}>Восстановить</button>
            <button className="btn sm" onClick={() => { try { localStorage.removeItem(draftKey(initial.id)); } catch { /* */ } setRestore(null); }}>Не нужно</button>
          </div>
        </div>
      )}

      <button className="list-item panel" style={{ marginBottom: 12, padding: 16 }} onClick={() => setSheet('head')}>
        <div className="grow">
          <div className="page-title" style={{ margin: 0, fontSize: 24 }}>{h.title || 'Без названия'}</div>
          <div className="small muted">{[h.customer || 'Заказчик не указан', h.date && date(h.date), EST_STATUS[h.status]].filter(Boolean).join(' · ')}</div>
          {initial.project && <div className="small" style={{ color: 'var(--amber)' }}>Объект: {initial.project.name}</div>}
        </div>
        <Icon.chevron className="chev" width={20} />
      </button>
      {lines.length > 0 && (
        <div className="grid2 quick-acts">
          <button className="btn sm" disabled={pdfBusy} onClick={() => sendPdf()}>📄 {pdfBusy ? 'Готовлю…' : 'PDF клиенту'}</button>
          <button className="btn sm" onClick={() => setSheet('head')}>📁 {initial.project ? 'Объект' : 'В объект'}</button>
        </div>
      )}

      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="xs muted">{readOnly ? 'Только просмотр' : saveState === 'saving' ? 'Сохраняю…' : saveState === 'error' ? 'Не сохранено' : dirty ? 'Есть изменения' : 'Сохранено'}</span>
        <div className="row">
          <button className={`chip ${grouped ? 'on' : ''}`} onClick={() => setGrouped(!grouped)}>По разделам</button>
          <button className="icon-btn" aria-label="Действия" onClick={() => setSheet('more')}><Icon.more /></button>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="panel"><State title="В смете пока нет позиций" text="Добавьте работы и материалы из своего справочника или пустой строкой." /></div>
      ) : (
        <div className="list">
          {order.map((g) => (
            <React.Fragment key={g.cat || 'all'}>
              {g.cat && (
                <div className="cat-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 8, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0, textAlign: 'left' }}
                    onClick={() => setFolded((x) => { const c = new Set(x); c.has(g.cat!) ? c.delete(g.cat!) : c.add(g.cat!); return c; })} aria-expanded={!folded.has(g.cat)}>
                    <span>{folded.has(g.cat) ? '▸' : '▾'} {g.cat}{h.sectionCoefs[g.cat === 'Без раздела' ? '' : g.cat!] ? ` · ×${n(h.sectionCoefs[g.cat === 'Без раздела' ? '' : g.cat!])}` : ''}<span className="muted" style={{ fontWeight: 400 }}> · {g.items.length}</span></span>
                    <span className="num">{rub(g.items.reduce((a, l) => a + totals.lineAmounts[idx.get(l.k)!], 0))}</span>
                  </button>
                  {!readOnly && <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Настройки раздела" onClick={() => setSecEdit(g.cat)}><Icon.more /></button>}
                </div>
              )}
              {!(g.cat && folded.has(g.cat)) && g.items.map((l) => (
                <div key={l.k} className={`line ${l.unconfirmed ? 'unconfirmed' : ''}`}>
                  <div className="line-top">
                    <input className="line-name" value={l.name} placeholder="Название позиции" list="own-items" onChange={(e) => setName(l, e.target.value)} readOnly={readOnly} aria-label="Название" />
                    <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Подробнее" onClick={() => { setEditLine(l.k); setSheet('line'); }}><Icon.more /></button>
                  </div>
                  {l.composition.trim() && (
                    <button className="line-comp" onClick={() => { setEditLine(l.k); setSheet('line'); }}>
                      в составе: {l.composition.split('\n').map((x) => x.replace(/^[-–•\s]+/, '').trim()).filter(Boolean).join('; ')}
                    </button>
                  )}
                  <div className="line-grid">
                    <NumInput value={l.qty} onChange={(v) => setLine(l.k, { qty: v })} placeholder="Кол-во" aria-label="Количество" readOnly={readOnly} invalid={parseNum(l.qty) < 0} />
                    <select className="select" style={{ minHeight: 40, padding: '6px 4px' }} value={l.unit} onChange={(e) => setLine(l.k, { unit: e.target.value })} disabled={readOnly} aria-label="Единица">
                      {[...new Set([l.unit, ...UNITS])].map((u) => <option key={u}>{u}</option>)}
                    </select>
                    <NumInput value={l.price} onChange={(v) => setLine(l.k, { price: v })} unit="₽" aria-label={l.matPrice !== '' ? 'Цена работы' : 'Цена'} placeholder={l.matPrice !== '' ? 'Работа' : 'Цена'} readOnly={readOnly} invalid={parseNum(l.price) < 0} />
                  </div>
                  {l.matPrice !== '' && (
                    <div className="line-grid mat">
                      <span className="xs muted" style={{ alignSelf: 'center' }}>+ материал</span>
                      <span />
                      <NumInput value={l.matPrice} onChange={(v) => setLine(l.k, { matPrice: v })} unit="₽" aria-label="Цена материала" readOnly={readOnly} />
                    </div>
                  )}
                  <div className="line-sum"><span className="muted">{TYPE_LABEL[l.type]}{l.category && !grouped ? ` · ${l.category}` : ''}{l.coef !== '' && parseNum(l.coef) !== 1 ? ` · ×${l.coef}` : ''}{l.unconfirmed ? ' · требует уточнения' : ''}</span><b className="num">{rub(totals.lineAmounts[idx.get(l.k)!])}</b></div>
                  {l.matPrice !== '' && totals.lineMat[idx.get(l.k)!] > 0 && <div className="xs muted" style={{ textAlign: 'right' }}>работа {rub(totals.lineWork[idx.get(l.k)!])} + материал {rub(totals.lineMat[idx.get(l.k)!])}</div>}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => setSheet('add')}><Icon.book width={18} />Из справочника</button>
          <button className="btn" onClick={() => addLines([{}])}><Icon.plus width={18} />Пустая строка</button>
        </div>
      )}
      <datalist id="own-items">{(cat.data || []).slice(0, 400).map((i: any) => <option key={i.id} value={i.name}>{`${i.price} ₽/${i.unit}`}</option>)}</datalist>
      {!readOnly && fresh.length > 0 && (
        <button className="btn block save-prices" style={{ marginTop: 8 }} onClick={() => { setSkip(new Set(fresh.filter((x) => /Примерная цена/.test(x.l.note)).map((x) => x.l.k))); setSheet('prices'); }}>
          💾 Запомнить мои расценки · {fresh.length}<small>новые и изменённые цены → в справочник, для следующих смет</small>
        </button>
      )}
      {!readOnly && (
        <div className="grid2" style={{ marginTop: 8 }}>
          <button className="btn sm" onClick={async () => { if (dirty) await save(); nav('/masters'); }}>👷 Посчитать мастером</button>
          <button className="btn sm" onClick={async () => { if (dirty) await save(); nav('/tools'); }}>📐 3D-проект</button>
        </div>
      )}

      <h2 className="section-title">Итог</h2>
      <div className="panel">
        <div className="dim"><div className="dim-value num">{rub(totals.total)}</div><div className="dim-label">Итого заказчику · работы {rub(totals.worksSubtotal)} · материалы {rub(totals.materialsSubtotal)}</div></div>
        <Fold id="est-total" title="Как получилась сумма" summary={[totals.markup > 0 && 'наценка', totals.discount > 0 && 'скидка', totals.tax > 0 && 'налог'].filter(Boolean).join(', ') || 'без наценок'}>
        <table className="breakdown">
          <tbody>
            <tr><td>Работы</td><td>{rub(totals.worksSubtotal)}</td></tr>
            <tr><td>Материалы</td><td>{rub(totals.materialsSubtotal)}</td></tr>
            {totals.otherSubtotal > 0 && <tr><td>Техника, услуги, прочее</td><td>{rub(totals.otherSubtotal)}</td></tr>}
            {totals.reserve > 0 && <tr><td>Резерв на потери ({pct(parseNum(h.lossReservePct))} от материалов)</td><td>{rub(totals.reserve)}</td></tr>}
            {totals.markup > 0 && <tr><td>Наценка {pct(parseNum(h.markupPct))}</td><td>{rub(totals.markup)}</td></tr>}
            {totals.discount > 0 && <tr><td>Скидка {pct(parseNum(h.discountPct))}</td><td>−{rub(totals.discount)}</td></tr>}
            {totals.delivery > 0 && <tr><td>Доставка</td><td>{rub(totals.delivery)}</td></tr>}
            {totals.extraCosts > 0 && <tr><td>Доп. расходы</td><td>{rub(totals.extraCosts)}</td></tr>}
            {totals.tax > 0 && <tr><td>Налог {pct(parseNum(h.taxPct))}</td><td>{rub(totals.tax)}</td></tr>}
            {totals.roundAdjust !== 0 && <tr><td>Округление</td><td>{rub(totals.roundAdjust)}</td></tr>}
            <tr className="total"><td>Итого</td><td>{rub(totals.total)}</td></tr>
          </tbody>
        </table>
        </Fold>
        <button className="btn block" style={{ marginTop: 4 }} onClick={() => setSheet('params')} disabled={readOnly}>Скидка, наценка, налог, доставка</button>
      </div>

      <button className="list-item panel" style={{ marginTop: 12 }} onClick={() => setSheet('pay')}>
        <div className="grow">
          <div className="title">График оплаты</div>
          <div className="xs muted">{h.paySchedule.length ? payStages(totals.total, h.paySchedule.map((x) => ({ title: x.title, pct: parseNum(x.pct) }))).map((x) => `${x.pct}% — ${rub(x.amount)}`).join(' · ') : 'Не задан — например, 50% аванс, 30% материал, 20% по окончании'}</div>
        </div>
        <Icon.chevron className="chev" width={20} />
      </button>
      {issues.length > 0 && <button className="xs" style={{ background: 'none', border: 0, padding: '8px 0 0', color: issues.some((i) => i.level === 'error') ? 'var(--bad)' : 'var(--muted)', cursor: 'pointer', textAlign: 'left' }} onClick={() => { setPending(null); setSheet('check'); }}>⚠️ Проверка сметы: замечаний {issues.length} — посмотреть</button>}

      <div className="grid2" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={pdfBusy} onClick={() => sendPdf()}>{pdfBusy ? 'Готовлю…' : '📄 PDF в Telegram'}</button>
        <button className="btn" disabled={pdfBusy} onClick={() => guard(openPdf)}>Открыть PDF</button>
      </div>
      <button className="btn block" style={{ marginTop: 8 }} disabled={pdfBusy} onClick={() => guard(openShare)}>🔗 Ссылка для заказчика</button>
      {(share.approvedAt || share.viewedAt || share.sharedAt) && (
        <button className="xs" style={{ background: 'none', border: 0, padding: '6px 0 0', color: share.approvedAt ? 'var(--ok)' : 'var(--muted)', cursor: 'pointer', textAlign: 'left' }} onClick={openShare}>
          {share.approvedAt ? `✓ Согласована заказчиком ${date(share.approvedAt)}` : share.viewedAt ? `👀 Заказчик открыл ${date(share.viewedAt)}, ещё не согласовал` : 'Ссылка отправлена, заказчик ещё не открывал'}
          {share.customerComment && /💬/.test(share.customerComment) ? ' · есть вопросы' : ''}
        </button>
      )}
      <Fold id="est-docs" title="📝 Договор, акт, Excel" summary="для заказчика">
        <div className="grid3">
          <button className="btn" disabled={pdfBusy} onClick={() => setSheet('contract')}>📝 Договор</button>
          <button className="btn" disabled={pdfBusy} onClick={() => sendFile('act')}>🧾 Акт</button>
          <button className="btn" disabled={pdfBusy} onClick={() => sendFile('xlsx')}>📊 Excel</button>
        </div>
        <p className="xs muted" style={{ marginBottom: 0 }}>В документах только то, что видит заказчик: без закупочных цен и вашей прибыли. Логотип, подпись и реквизиты — в Настройках.{!me.access.active && ' Договор, акт и Excel — по подписке.'}</p>
      </Fold>

      <Fold id="est-own" title="🔒 Для себя: прибыль" summary={<span className={totals.plannedProfit < 0 ? 'neg' : ''}>{rub(totals.plannedProfit)}</span>}>
        <table className="breakdown"><tbody>
          <tr><td>Себестоимость (прямые затраты)</td><td>{rub(totals.directCost)}</td></tr>
          <tr><td>Выручка без налога</td><td>{rub(totals.revenueExTax)}</td></tr>
          <tr className="total"><td>Плановая прибыль</td><td className={totals.plannedProfit < 0 ? 'neg' : 'pos'}>{rub(totals.plannedProfit)}</td></tr>
          <tr><td>Маржа</td><td>{pct(totals.marginPct)}</td></tr>
        </tbody></table>
        {totals.linesWithoutCost > 0 && <p className="xs muted" style={{ marginBottom: 0 }}>У {totals.linesWithoutCost} поз. не указана закупочная цена — они не входят в себестоимость, прибыль может быть завышена.</p>}
        <button className="btn block" style={{ marginTop: 12 }} disabled={pdfBusy} onClick={() => sendFile('xlsxown')}>📊 Excel для себя (с прибылью)</button>
      </Fold>

      <div className="totalbar"><div className="in">
        <div className="grow"><div className="xs muted">Итого</div><div className="sum num">{rub(totals.total)}</div></div>
        {!readOnly && <button className="btn primary" onClick={save} disabled={!dirty || saveState === 'saving'}>{saveState === 'saving' ? 'Сохраняю…' : dirty ? 'Сохранить' : 'Сохранено'}</button>}
      </div></div>
      <div style={{ height: 80 }} />

      {/* ---- Ссылка для заказчика ---- */}
      <Sheet open={sheet === 'share'} onClose={() => setSheet(null)} title="Ссылка для заказчика">
        <ShareSheet id={initial.id} title={h.title} total={totals.total} share={share} setShare={setShare} onClose={() => setSheet(null)} />
      </Sheet>

      {/* ---- Договор ---- */}
      <Sheet open={sheet === 'contract'} onClose={() => setSheet(null)} title="Договор подряда">
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Типовой договор подряда, смета — приложением № 1. Стороны, адрес, сумма и условия оплаты берутся из сметы.</p>
          <Field label="Паспорт или реквизиты заказчика" hint="Можно оставить пустым — будет строка для заполнения от руки">
            <textarea className="textarea" style={{ minHeight: 64 }} value={h.customerDetails} onChange={(e) => setHead({ customerDetails: e.target.value })} placeholder="Паспорт 0000 000000, выдан …; тел. +7 …" readOnly={readOnly} />
          </Field>
          <div className="grid2">
            <Field label="Начало работ"><input className="input" type="date" value={h.workStart} onChange={(e) => setHead({ workStart: e.target.value })} readOnly={readOnly} /></Field>
            <Field label="Окончание"><input className="input" type="date" value={h.workEnd} onChange={(e) => setHead({ workEnd: e.target.value })} readOnly={readOnly} /></Field>
          </div>
          <Field label="Гарантия на работы"><NumInput value={h.warrantyMonths} onChange={(v) => setHead({ warrantyMonths: v })} unit="мес." readOnly={readOnly} /></Field>
          {!h.customer.trim() && <div className="banner">Укажите заказчика в данных сметы — иначе в договоре будет пустая строка.</div>}
          <div className="grid2">
            <button className="btn primary" disabled={pdfBusy} onClick={() => sendFile('contract')}>{pdfBusy ? 'Готовлю…' : 'В Telegram'}</button>
            <button className="btn" disabled={pdfBusy} onClick={() => openFile('contract')}>Открыть</button>
          </div>
          <p className="xs muted" style={{ margin: 0 }}>Это типовой шаблон, а не юридическая консультация. Перед подписанием проверьте условия под свою ситуацию; при крупных суммах покажите договор юристу.</p>
        </div>
      </Sheet>

      {/* ---- Проверка перед отправкой ---- */}
      <Sheet open={sheet === 'check'} onClose={() => { setSheet(null); setPending(null); }} title="Проверка сметы">
        <div className="stack">
          {issues.length ? issues.map((i, k) => (
            <div key={k} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <span>{i.level === 'error' ? '⛔' : '⚠️'}</span><span className="small">{i.text}</span>
            </div>
          )) : <p className="small">Замечаний нет — смета готова к отправке.</p>}
          {pending && <button className="btn primary block lg" onClick={() => { const f = pending; setPending(null); setSheet(null); f(); }}>Всё равно отправить</button>}
          <button className="btn block" onClick={() => { setSheet(null); setPending(null); }}>Исправить</button>
        </div>
      </Sheet>

      {/* ---- График оплаты ---- */}
      <Sheet open={sheet === 'pay'} onClose={() => setSheet(null)} title="График оплаты">
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Этапы попадут в смету, договор и на страницу заказчика. Оплаченные этапы отмечаются сами — по поступлениям объекта.</p>
          {h.paySchedule.map((x, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input className="input grow" value={x.title} onChange={(e) => setHead({ paySchedule: h.paySchedule.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)) })} placeholder="Аванс" readOnly={readOnly} />
              <div style={{ width: 92 }}><NumInput value={x.pct} onChange={(v) => setHead({ paySchedule: h.paySchedule.map((y, j) => (j === i ? { ...y, pct: v } : y)) })} unit="%" readOnly={readOnly} /></div>
              {!readOnly && <button className="icon-btn" aria-label="Удалить этап" onClick={() => setHead({ paySchedule: h.paySchedule.filter((_, j) => j !== i) })}><Icon.trash width={18} /></button>}
            </div>
          ))}
          {h.paySchedule.length > 0 && <div className="xs muted">Итого: {h.paySchedule.reduce((a, x) => a + parseNum(x.pct), 0)}% {h.paySchedule.reduce((a, x) => a + parseNum(x.pct), 0) !== 100 ? '— должно быть 100%' : '✓'}</div>}
          {!readOnly && (
            <div className="row wrap">
              <button className="btn sm" onClick={() => setHead({ paySchedule: [...h.paySchedule, { title: '', pct: '' }] })}><Icon.plus width={16} />Этап</button>
              <button className="btn sm" onClick={() => setHead({ paySchedule: DEFAULT_SCHEDULE.map((x) => ({ title: x.title, pct: String(x.pct) })) })}>50 / 30 / 20</button>
              <button className="btn sm" onClick={() => setHead({ paySchedule: [{ title: 'Аванс', pct: '50' }, { title: 'По окончании работ', pct: '50' }] })}>50 / 50</button>
              {h.paySchedule.length > 0 && <button className="btn sm ghost" onClick={() => setHead({ paySchedule: [] })}>Убрать график</button>}
            </div>
          )}
          <button className="btn primary block" onClick={() => setSheet(null)}>Готово</button>
        </div>
      </Sheet>

      {/* ---- Раздел ---- */}
      <Sheet open={!!secEdit} onClose={() => setSecEdit(null)} title="Раздел">
        {secEdit && <SectionForm name={secEdit === 'Без раздела' ? '' : secEdit} coef={h.sectionCoefs[secEdit === 'Без раздела' ? '' : secEdit]}
          onSave={(newName, coef) => {
            const old = secEdit === 'Без раздела' ? '' : secEdit;
            if (newName !== old) setLines((ls) => ls.map((l) => ((l.category || '') === old ? { ...l, category: newName } : l)));
            const sc = { ...h.sectionCoefs }; delete sc[old];
            if (coef && coef !== 1) sc[newName] = coef;
            setHead({ sectionCoefs: sc }); setSecEdit(null);
          }} />}
      </Sheet>

      {/* ---- Шапка ---- */}
      <Sheet open={sheet === 'head'} onClose={() => setSheet(null)} title="Данные сметы">
        <HeadForm h={h} setHead={setHead} readOnly={readOnly} />
      </Sheet>

      {/* ---- Параметры ---- */}
      <Sheet open={sheet === 'params'} onClose={() => setSheet(null)} title="Скидка, наценка, налог">
        <div className="stack">
          <div className="grid2">
            <Field label="Наценка" hint="На подытог и резерв"><NumInput value={h.markupPct} onChange={(v) => setHead({ markupPct: v })} unit="%" /></Field>
            <Field label="Скидка" hint="После наценки"><NumInput value={h.discountPct} onChange={(v) => setHead({ discountPct: v })} unit="%" /></Field>
            <Field label="Резерв на потери" hint="От суммы материалов"><NumInput value={h.lossReservePct} onChange={(v) => setHead({ lossReservePct: v })} unit="%" /></Field>
            <Field label="Налог" hint="Начисляется сверху"><NumInput value={h.taxPct} onChange={(v) => setHead({ taxPct: v })} unit="%" /></Field>
            <Field label="Доставка"><NumInput value={h.delivery} onChange={(v) => setHead({ delivery: v })} unit="₽" /></Field>
            <Field label="Доп. расходы"><NumInput value={h.extraCosts} onChange={(v) => setHead({ extraCosts: v })} unit="₽" /></Field>
          </div>
          <p className="xs muted">Порядок: подытог → резерв → наценка → скидка → доставка и доп. расходы → налог. Коэффициенты строк и разделов применяются к ценам.</p>
          <div className="panel stack">
            <div className="title" style={{ fontWeight: 700 }}>Итог ровной суммой</div>
            <div className="xs muted">Сейчас: {rub(totals.total)}{totals.roundAdjust ? ` (округление ${rub(totals.roundAdjust)})` : ''}. Цены позиций не меняются — в смете будет строка «Округление».</div>
            <div className="row wrap">
              {[1000, 5000, 10000].map((st) => {
                const before = totals.total - totals.roundAdjust;
                const target = Math.floor(before / st) * st;
                return target > 0 && target < before ? <button key={st} className="btn sm" disabled={readOnly} onClick={() => roundTo(target)}>вниз до {rub(target)}</button> : null;
              })}
              {totals.roundAdjust !== 0 && <button className="btn sm ghost" disabled={readOnly} onClick={() => setHead({ roundAdjust: '0' })}>Без округления</button>}
            </div>
          </div>
          <div className="panel stack">
            <div className="title" style={{ fontWeight: 700 }}>Поднять все цены</div>
            <div className="row" style={{ gap: 6 }}>
              <div style={{ width: 110 }}><NumInput value={raise.pct} onChange={(v) => setRaise((r) => ({ ...r, pct: v }))} unit="%" placeholder="10" /></div>
              <select className="select grow" value={raise.scope} onChange={(e) => setRaise((r) => ({ ...r, scope: e.target.value }))}>
                <option value="all">всё</option><option value="work">только работы</option><option value="mat">только материалы</option>
              </select>
            </div>
            <button className="btn block" disabled={readOnly || !parseNum(raise.pct)} onClick={() => {
              const k = 1 + parseNum(raise.pct) / 100;
              const r2 = (v: string) => (v === '' ? v : String(Math.round(parseNum(v) * k * 100) / 100));
              setLines((ls) => ls.map((l) => {
                const isMat = l.type === 'material';
                const work = raise.scope !== 'mat' && !isMat;
                const mat = raise.scope !== 'work';
                return { ...l, price: (isMat ? mat : work) ? r2(l.price) : l.price, matPrice: mat ? r2(l.matPrice) : l.matPrice };
              }));
              change(); toast(`Цены ${parseNum(raise.pct) > 0 ? 'подняты' : 'снижены'} на ${Math.abs(parseNum(raise.pct))}%`); setRaise({ pct: '', scope: raise.scope });
            }}>Применить</button>
            <div className="xs muted">Например, материалы подорожали на 8% — поднимите только материалы. Отрицательное число — снизить.</div>
          </div>
          <button className="btn primary block" onClick={() => setSheet(null)}>Готово</button>
        </div>
      </Sheet>

      {/* ---- Строка подробно ---- */}
      <Sheet open={sheet === 'line' && !!current} onClose={() => setSheet(null)} title="Позиция">
        {current && (
          <div className="stack">
            <Field label="Название"><input className="input" value={current.name} list="own-items" onChange={(e) => setName(current, e.target.value)} readOnly={readOnly} /></Field>
            {current.type === 'material' && !readOnly && (() => {
              const vs = materialVariants(current.name, parseNum(current.price));
              if (!vs.length) return null;
              const t = currentTier(current.name);
              return (
                <div>
                  <div className="xs muted" style={{ marginBottom: 4 }}>Вариант материала</div>
                  <div className="tier-row" role="radiogroup" aria-label="Вариант материала">
                    {vs.map((v) => <button key={v.tier} role="radio" aria-checked={t === v.tier} className={t === v.tier ? 'on' : ''} onClick={() => setLine(current.k, { name: v.name, price: String(v.price), costPrice: current.costPrice ? String(v.price) : current.costPrice })}>{v.label}<b className="num">{rub(v.price)}</b></button>)}
                  </div>
                </div>
              );
            })()}
            {(current.type === 'material' || current.matPrice !== '') && current.name.trim() && <ShopLink name={current.name} block label="🛒 Найти в «Петровиче» — цена и наличие" />}
            <div className="grid2">
              <Field label="Тип"><select className="select" value={current.type} onChange={(e) => setLine(current.k, { type: e.target.value })} disabled={readOnly}>{Object.entries(TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
              <Field label="Раздел"><input className="input" value={current.category} onChange={(e) => setLine(current.k, { category: e.target.value })} readOnly={readOnly} placeholder="Напр. Фундамент" list="sections" /></Field>
              <Field label="Количество"><NumInput value={current.qty} onChange={(v) => setLine(current.k, { qty: v })} unit={current.unit} readOnly={readOnly} /></Field>
              <Field label="Единица"><input className="input" value={current.unit} onChange={(e) => setLine(current.k, { unit: e.target.value })} readOnly={readOnly} /></Field>
              <Field label={current.matPrice !== '' ? 'Цена работы за ед.' : 'Цена за ед.'}><NumInput value={current.price} onChange={(v) => setLine(current.k, { price: v })} unit="₽" readOnly={readOnly} /></Field>
              <Field label="Цена материала за ед." hint="Если работа с материалом — в одной строке"><NumInput value={current.matPrice} onChange={(v) => setLine(current.k, { matPrice: v })} unit="₽" readOnly={readOnly} placeholder="—" /></Field>
              <Field label="Коэффициент" hint="Зима, высота, стеснённо: 1,15"><NumInput value={current.coef} onChange={(v) => setLine(current.k, { coef: v })} unit="×" readOnly={readOnly} placeholder="1" /></Field>
              <Field label="Закупочная / себестоимость" hint="Не видна заказчику"><NumInput value={current.costPrice} onChange={(v) => setLine(current.k, { costPrice: v })} unit="₽" readOnly={readOnly} placeholder="—" /></Field>
            </div>
            <Field label="В составе" hint="Каждый пункт с новой строки — в смете будет списком под названием">
              <textarea className="textarea" style={{ minHeight: 96 }} value={current.composition} onChange={(e) => setLine(current.k, { composition: e.target.value })} readOnly={readOnly} placeholder={'сетка Гиттер 1,73 м\nстолбы 60×60×3000 мм\nметод монтажа — бутование'} />
            </Field>
            <Field label="Примечание"><input className="input" value={current.note} onChange={(e) => setLine(current.k, { note: e.target.value })} readOnly={readOnly} /></Field>
            <datalist id="sections">{[...new Set(lines.map((x) => x.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist>
            {current.unconfirmed && <label className="row small"><input type="checkbox" checked={!current.unconfirmed} onChange={() => setLine(current.k, { unconfirmed: false })} />Позиция уточнена</label>}
            {!readOnly && (
              <div className="row wrap">
                <button className="btn sm" onClick={() => move(current.k, -1)}><Icon.up width={16} />Выше</button>
                <button className="btn sm" onClick={() => move(current.k, 1)}><Icon.down width={16} />Ниже</button>
                <button className="btn sm" onClick={() => { duplicate(current.k); setSheet(null); }}><Icon.copy width={16} />Дублировать</button>
                <button className="btn sm danger" onClick={() => remove(current.k)}><Icon.trash width={16} />Удалить</button>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* ---- Добавить из справочника ---- */}
      <Sheet open={sheet === 'add'} onClose={() => setSheet(null)} title="Добавить из справочника">
        {sheet === 'add' && <CatalogPicker onPick={(it) => addLines([{ name: it.name, unit: it.unit, price: String(it.price), matPrice: Number(it.params?.matPrice) > 0 ? String(it.params.matPrice) : '', composition: it.description || '', costPrice: it.costPrice == null ? '' : String(it.costPrice), type: it.type, category: it.category, catalogItemId: it.id }])} />}
      </Sheet>

      {/* ---- Действия ---- */}
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="Действия со сметой">
        <div className="list">
          <button className="list-item" disabled={readOnly} onClick={() => action(async () => { const r = await post(`/estimates/${initial.id}/refresh-prices`); setLines(r.lines.map(toL)); setDirty(false); setSheet(null); toast(r.changed ? `Обновлено цен: ${r.changed}` : 'Цены уже актуальны'); })}>
            <div className="grow"><div className="title">Обновить цены из справочника</div><div className="xs muted">Подставит текущие цены в позиции, добавленные из справочника</div></div>
          </button>
          <button className="list-item" disabled={readOnly} onClick={() => action(async () => { const e = await post(`/estimates/${initial.id}/duplicate`); setSheet(null); nav(`/estimates/${e.id}`); }, 'Копия создана')}>
            <div className="grow title">Копировать смету</div>
          </button>
          {!initial.isTemplate && <button className="list-item" disabled={readOnly} onClick={() => action(async () => { await post(`/estimates/${initial.id}/save-as-template`, {}); setSheet(null); }, 'Шаблон сохранён')}>
            <div className="grow title">Сохранить как шаблон</div>
          </button>}
          <button className="list-item" onClick={() => nav(`/estimates/${initial.id}/acts`)}><div className="grow"><div className="title">Акты выполненных работ, КС-2, КС-3</div><div className="xs muted">Промежуточные акты по частям и остаток работ</div></div></button>
          <button className="list-item" onClick={() => nav(`/estimates/${initial.id}/purchase`)}><div className="grow"><div className="title">Ведомость закупки материалов</div><div className="xs muted">Что купить, с отметками и отправкой поставщику</div></div></button>
          <button className="list-item" onClick={() => setSheet('params')}><div className="grow"><div className="title">Поднять цены на %</div><div className="xs muted">Подорожали материалы — пересчитать всё разом</div></div></button>
          <button className="list-item" onClick={() => setSheet('history')}><div className="grow title">История изменений</div></button>
          <button className="list-item" disabled={readOnly} onClick={async () => {
            if (!(await confirmDialog('Удалить смету? Её можно будет восстановить по запросу в поддержку.'))) return;
            await action(async () => { await del(`/estimates/${initial.id}`); nav('/estimates', { replace: true }); }, 'Смета удалена');
          }}><div className="grow title" style={{ color: 'var(--bad)' }}>Удалить смету</div></button>
        </div>

      </Sheet>

      {/* ---- Запомнить расценки ---- */}
      <Sheet open={sheet === 'prices'} onClose={() => setSheet(null)} title="Запомнить мои расценки">
        {sheet === 'prices' && (
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>Отмеченные цены сохранятся в «Справочник цен». Примерные цены из шаблонов не отмечены — проверьте их сначала. В новых сметах, шаблонах, мастерах и при вводе названия они подставятся сами.</p>
            <div className="list">
              {fresh.map(({ l, it }) => {
                const on = !skip.has(l.k);
                const mat = l.matPrice !== '' && parseNum(l.matPrice) > 0 ? ` + мат. ${rub(parseNum(l.matPrice))}` : '';
                return (
                  <label key={l.k} className="list-item" style={{ gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => setSkip((x) => { const c = new Set(x); if (on) c.add(l.k); else c.delete(l.k); return c; })} />
                    <div className="grow">
                      <div className="title">{l.name}</div>
                      <div className="xs muted">{TYPE_LABEL[l.type]} · {it ? <>было {rub(Number(it.price))}{itemMat(it) ? ` + мат. ${rub(itemMat(it)!)}` : ''} → <b style={{ color: 'var(--amber)' }}>{rub(parseNum(l.price))}{mat}</b></> : <><b style={{ color: 'var(--ok)' }}>новая</b> · {rub(parseNum(l.price))}{mat} за {l.unit}</>}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => setSkip(new Set())}>Выбрать все</button>
              <button className="btn sm" onClick={() => setSkip(new Set(fresh.map((x) => x.l.k)))}>Снять все</button>
            </div>
            <button className="btn primary block lg" onClick={savePrices}>💾 Сохранить в справочник · {fresh.length - fresh.filter((x) => skip.has(x.l.k)).length}</button>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title="История изменений">
        {sheet === 'history' && <History id={initial.id} />}
      </Sheet>
    </>
  );
}

function HeadForm({ h, setHead, readOnly }: { h: H; setHead: (p: Partial<H>) => void; readOnly: boolean }) {
  const projects = useLoad(() => get<any[]>('/projects'), []);
  return (
    <div className="stack">
      <Field label="Название"><input className="input" value={h.title} onChange={(e) => setHead({ title: e.target.value })} readOnly={readOnly} /></Field>
      <Field label="Заказчик"><input className="input" value={h.customer} onChange={(e) => setHead({ customer: e.target.value })} readOnly={readOnly} /></Field>
      <Field label="Адрес"><input className="input" value={h.address} onChange={(e) => setHead({ address: e.target.value })} readOnly={readOnly} /></Field>
      <div className="grid2">
        <Field label="Дата"><input className="input" type="date" value={h.date} onChange={(e) => setHead({ date: e.target.value })} readOnly={readOnly} /></Field>
        <Field label="Статус"><select className="select" value={h.status} onChange={(e) => setHead({ status: e.target.value })} disabled={readOnly}>{Object.entries(EST_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
      </div>
      <Field label="Объект" hint="Смета станет плановым бюджетом объекта">
        <select className="select" value={h.projectId || ''} onChange={(e) => setHead({ projectId: e.target.value || null })} disabled={readOnly}>
          <option value="">Без объекта</option>
          {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Условия оплаты" hint="Попадут в PDF для заказчика">
        <textarea className="textarea" style={{ minHeight: 70 }} value={h.paymentTerms} placeholder="Аванс 50% перед началом работ, остаток — после подписания акта" onChange={(e) => setHead({ paymentTerms: e.target.value })} readOnly={readOnly} />
      </Field>
      <Field label="Смета действительна, дней"><NumInput value={h.validDays} onChange={(v) => setHead({ validDays: v })} unit="дн." readOnly={readOnly} /></Field>
      <Field label="Примечания для заказчика"><textarea className="textarea" value={h.notes} onChange={(e) => setHead({ notes: e.target.value })} readOnly={readOnly} /></Field>
      {!readOnly && (
        <div className="seg">
          {['Цена указана за наличный расчёт.', 'Безналичный расчёт, без НДС.', 'Цены материалов действительны 14 дней.', 'Вывоз мусора включён.', 'Вывоз мусора оплачивается отдельно.', 'Гарантия на работы — 12 месяцев.', 'Электроэнергия и вода — за счёт заказчика.'].map((t) => (
            <button key={t} className="chip" onClick={() => setHead({ notes: h.notes.includes(t) ? h.notes : `${h.notes ? `${h.notes.trim()}\n` : ''}${t}` })}>+ {t.replace(/\.$/, '')}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogPicker({ onPick }: { onPick: (item: any) => void }) {
  const toast = useToast();
  const lists = useLoad(() => get<any[]>('/pricelists'), []);
  const [listId, setListId] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const items = useLoad(() => get<any[]>('/items', { priceListId: listId, q: dq }), [listId, dq]);
  return (
    <>
      {(lists.data?.length || 0) > 1 && (
        <select className="select" style={{ marginBottom: 12 }} value={listId || lists.data!.find((l) => l.isDefault)?.id} onChange={(e) => setListId(e.target.value)} aria-label="Прайс-лист">
          {lists.data!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      <SearchBox value={q} onChange={setQ} placeholder="Найти работу или материал" />
      <Load state={items} empty={(d) => (d.length ? null : <State title={q ? 'Ничего не найдено' : 'Справочник пуст'} text="Добавьте свои работы и материалы с ценами в разделе «Справочник»." />)}>
        {(list) => (
          <div className="list">
            {list.map((it) => (
              <button key={it.id} className="list-item" onClick={() => { onPick(it); toast(`Добавлено: ${it.name}`); }}>
                <div className="grow"><div className="title ellipsis">{it.name}</div><div className="xs muted">{it.category} · {TYPE_LABEL[it.type]}</div></div>
                <div className="num right small">{rub(it.price)}<div className="xs muted">за {it.unit}</div></div>
                <Icon.plus width={18} style={{ color: 'var(--accent)' }} />
              </button>
            ))}
          </div>
        )}
      </Load>
    </>
  );
}

const ACTIONS: Record<string, string> = { create: 'Создана', update: 'Изменена', add_lines: 'Добавлены позиции', refresh_prices: 'Обновлены цены', delete: 'Удалена', restore: 'Восстановлена' };
function History({ id }: { id: string }) {
  const h = useLoad(() => get<any[]>(`/estimates/${id}/history`), [id]);
  return (
    <Load state={h} empty={(d) => (d.length ? null : <State title="Изменений пока нет" />)}>
      {(list) => (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow">
                <div className="title">{ACTIONS[r.action] || r.action}</div>
                <div className="xs muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              {r.data?.totalAfter != null && <div className="small num right">{rub(r.data.totalBefore)} → <b>{rub(r.data.totalAfter)}</b></div>}
              {r.data?.count != null && <div className="small">+{n(r.data.count, 0)}</div>}
            </div>
          ))}
        </div>
      )}
    </Load>
  );
}

function ShareSheet({ id, title, total, share, setShare, onClose }: { id: string; title: string; total: number; share: any; setShare: (s: any) => void; onClose: () => void }) {
  const toast = useToast();
  if (!share?.url) return <p className="small muted">Готовлю ссылку…</p>;
  const text = `Смета «${title}» на ${rub(total)}. Посмотрите и нажмите «Согласовать», если всё устраивает:`;
  const sendTg = () => {
    const u = `https://t.me/share/url?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text}\n${share.url}`); haptic('success'); toast('Скопировано — вставьте в WhatsApp, SMS или почту'); }
    catch { toast('Не удалось скопировать — выделите ссылку вручную', true); }
  };
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Заказчик откроет смету в браузере без Telegram и сможет нажать «Согласовать» или задать вопрос. Уведомление придёт вам в бот. Закупочные цены и прибыль заказчик не видит.</p>
      <input className="input" readOnly value={share.url} onFocus={(e) => e.target.select()} aria-label="Ссылка" />
      <button className="btn primary block lg" onClick={sendTg}>Отправить в Telegram</button>
      <div className="grid2">
        <button className="btn" onClick={copy}>Скопировать</button>
        <button className="btn" onClick={() => (tg?.openLink ? tg.openLink(share.url) : window.open(share.url, '_blank'))}>Как видит заказчик</button>
      </div>
      <div className="panel">
        <div className="small">{share.approvedAt ? <b style={{ color: 'var(--ok)' }}>✓ Согласована {date(share.approvedAt)}</b> : share.viewedAt ? `👀 Открыта заказчиком ${date(share.viewedAt)}` : 'Заказчик ещё не открывал'}</div>
        {share.customerComment && <div className="xs" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{share.customerComment}</div>}
      </div>
      <button className="btn ghost block" onClick={async () => {
        if (!(await confirmDialog('Отозвать ссылку? Старая перестанет открываться, новую можно сделать в любой момент.'))) return;
        try { setShare({ ...(await del(`/estimates/${id}/share`)), url: null }); toast('Ссылка отозвана'); onClose(); } catch (e: any) { toast(e.message, true); }
      }}>Отозвать ссылку</button>
    </div>
  );
}

function SectionForm({ name, coef, onSave }: { name: string; coef?: number; onSave: (name: string, coef: number) => void }) {
  const [v, setV] = useState(name);
  const [k, setK] = useState(coef && coef !== 1 ? String(coef) : '');
  return (
    <div className="stack">
      <Field label="Название раздела" hint="Изменится у всех позиций раздела"><input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="Напр. Ограждения и ворота" /></Field>
      <Field label="Коэффициент на раздел" hint="Применяется ко всем ценам раздела: зимние работы 1,15, стеснённые условия 1,1">
        <NumInput value={k} onChange={setK} unit="×" placeholder="1" />
      </Field>
      <div className="seg">{['1.1', '1.15', '1.2', '1.3'].map((x) => <button key={x} className={`chip ${k === x ? 'on' : ''}`} onClick={() => setK(x)}>×{x.replace('.', ',')}</button>)}<button className="chip" onClick={() => setK('')}>без</button></div>
      <button className="btn primary block" onClick={() => onSave(v.trim(), parseNum(k) > 0 ? parseNum(k) : 1)}>Сохранить</button>
    </div>
  );
}
