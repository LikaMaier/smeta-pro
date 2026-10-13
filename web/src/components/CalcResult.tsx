import React, { useEffect, useMemo, useState } from 'react';
import ShopLink from './ShopLink';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { NumInput, useLoad, useToast } from './ui';
import { n, rub, parseNum, TYPE_LABEL } from '../format';
import { haptic } from '../tg';
import { normName } from '../../../shared/names';
import { materialVariants, TIER_LABEL, type Tier } from '../../../shared/materialTiers';

/**
 * Редактируемый результат мастера / калькулятора.
 * Цена по умолчанию: ваш справочник → цена магазина (ориентировочная) → пусто.
 * Прораб меняет количество и цену прямо в таблице, итог пересчитывается сразу;
 * изменённые цены можно сохранить в справочник — в следующий раз подставятся они.
 */
type Sug = { name: string; qty: number; unit: string; type: string; price?: number; note?: string; composition?: string; category?: string };
type Ovr = { qty?: string; price?: string; off?: boolean; base?: number };

const PKEY = (id: string) => `smeta_calc_prices_${id}`;
const loadPrices = (id: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(PKEY(id)) || '{}'); } catch { return {}; } };

export default function CalcResult({ calcId, suggestions, estimateTitle, onAdded }: { calcId: string; suggestions: Sug[]; estimateTitle: string; onAdded?: (estimateId: string) => Promise<void> | void }) {
  const nav = useNavigate();
  const toast = useToast();
  const items = useLoad(() => get<any[]>('/items').catch(() => []), []);
  const drafts = useLoad(() => get<any[]>('/estimates', { status: 'draft' }).catch(() => []), []);
  const [ovr, setOvr] = useState<Record<string, Ovr>>({});
  const [myPrices, setMyPrices] = useState<Record<string, string>>(() => loadPrices(calcId));
  const [target, setTarget] = useState('new');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // класс материалов: эконом / стандарт / премиум — для всех строк сразу и для каждой отдельно
  const [tier, setTierAll] = useState<Tier>(() => { try { return (localStorage.getItem('smeta_tier') as Tier) || 'std'; } catch { return 'std'; } });
  const [rowTier, setRowTier] = useState<Record<string, Tier>>({});

  // ключ строки: название + номер повтора (одинаковые названия в разных разделах)
  const keyed = useMemo(() => {
    const seen: Record<string, number> = {};
    return suggestions.map((s) => { const c = (seen[s.name] = (seen[s.name] || 0) + 1); return { ...s, key: c > 1 ? `${s.name}#${c}` : s.name }; });
  }, [suggestions]);

  // пересчёт параметров: ручное количество сбрасывается, если расчётное изменилось
  useEffect(() => {
    setOvr((o) => {
      const next: Record<string, Ovr> = {};
      for (const s of keyed) {
        const x = o[s.key];
        if (!x) continue;
        next[s.key] = { ...x, ...(x.base != null && x.base !== s.qty ? { qty: undefined, base: s.qty } : {}) };
      }
      return next;
    });
  }, [keyed]);

  const cat = useMemo(() => new Map((items.data || []).map((i: any) => [normName(i.name), i])), [items.data]);

  const rows = keyed.map((s0) => {
    const variants = s0.type === 'material' && s0.price ? materialVariants(s0.name, s0.price) : [];
    const t = rowTier[s0.key] ?? tier;
    const v = variants.find((x) => x.tier === t);
    const s = v ? { ...s0, name: v.name, price: v.price } : s0;
    const o = ovr[s.key] || {};
    const mine = cat.get(normName(s.name));
    const remembered = myPrices[s.name];
    const defPrice = mine ? String(mine.price) : remembered ?? (s.price != null ? String(s.price) : '');
    const src: 'own' | 'store' | 'none' = mine ? 'own' : remembered != null ? 'own' : s.price != null ? 'store' : 'none';
    const price = o.price ?? defPrice;
    const qty = o.qty ?? String(s.qty);
    const on = !o.off;
    const sum = on ? Math.round(parseNum(qty) * parseNum(price) * 100) / 100 : 0;
    return { ...s, variants, tier: t, baseQty: s.qty, o, mine, price, qty, on, sum, src, edited: o.price != null && o.price !== defPrice, qtyEdited: o.qty != null && parseNum(o.qty) !== s.qty };
  });

  const chooseAll = (t: Tier) => { setTierAll(t); setRowTier({}); setOvr((x) => Object.fromEntries(Object.entries(x).map(([k, o]) => [k, { ...o, price: undefined }]))); try { localStorage.setItem('smeta_tier', t); } catch { /* */ } };
  const chooseRow = (key: string, t: Tier) => { setRowTier((x) => ({ ...x, [key]: t })); setOvr((x) => ({ ...x, [key]: { ...x[key], price: undefined } })); };
  const set = (key: string, patch: Partial<Ovr>, baseQty?: number) => setOvr((x) => ({ ...x, [key]: { ...x[key], ...patch, ...(baseQty != null ? { base: baseQty } : {}) } }));
  const total = rows.reduce((a, r) => a + r.sum, 0);
  const mats = rows.filter((r) => r.type === 'material').reduce((a, r) => a + r.sum, 0);
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    rows.forEach((r) => { const g = r.category || (r.type === 'material' ? 'Материалы' : 'Работы'); m.set(g, [...(m.get(g) || []), r]); });
    return [...m.entries()];
  }, [rows]);

  const submit = async () => {
    const chosen = rows.filter((r) => r.on && parseNum(r.qty) > 0);
    if (!chosen.length) return toast('Отметьте хотя бы одну позицию', true);
    setBusy(true);
    try {
      const changed = chosen.filter((r) => r.edited && parseNum(r.price) > 0);
      if (remember && changed.length) {
        await post('/items/bulk-upsert', { items: changed.map((r) => ({ name: r.name, unit: r.unit, type: r.type, category: r.category?.replace(/: материалы$/, '') || null, price: parseNum(r.price), composition: r.composition || null })) });
        const mp = { ...myPrices }; changed.forEach((r) => (mp[r.name] = r.price));
        setMyPrices(mp); try { localStorage.setItem(PKEY(calcId), JSON.stringify(mp)); } catch { /* */ }
      }
      const lines = chosen.map((r) => ({
        name: r.mine?.name || r.name, qty: parseNum(r.qty), unit: r.unit, price: parseNum(r.price), type: r.type, category: r.category || null,
        costPrice: r.type === 'material' ? parseNum(r.price) : r.mine?.costPrice ?? null, catalogItemId: r.mine?.id || null,
        composition: r.composition || r.mine?.description || null,
        note: r.src === 'store' && !r.edited ? r.note || null : null,
        unconfirmed: r.src === 'store' && !r.edited && r.type === 'material',
      }));
      let id = target;
      if (target === 'new') id = (await post('/estimates', { title: estimateTitle || 'Новая смета' })).id;
      await post(`/estimates/${id}/lines`, { lines });
      if (onAdded) await Promise.resolve(onAdded(id)).catch(() => {});
      haptic('success');
      toast(changed.length && remember ? `Добавлено в смету. Ваши цены сохранены: ${changed.length}` : 'Добавлено в смету');
      nav(`/estimates/${id}`);
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(false); }
  };

  if (!rows.length) return null;
  const editedCount = rows.filter((r) => r.edited).length;

  return (
    <div className="calc-result">
      <div className="csection">Работы и материалы — можно менять</div>
      <p className="xs muted" style={{ margin: '4px 0 8px' }}>Цена: <span className="src own">мой прайс</span> — из вашего справочника, <span className="src store">цена магазина</span> / <span className="src store">примерная</span> — ориентировочно по рынку. Меняйте количество и цену — итог пересчитается.</p>
      {rows.some((r) => r.variants.length) && (
        <div className="tier-all">
          <span className="small">Материалы:</span>
          <div className="segc" role="radiogroup" aria-label="Класс материалов">
            {(['eco', 'std', 'prem'] as Tier[]).map((t) => <button key={t} role="radio" aria-checked={tier === t} className={tier === t ? 'on' : ''} onClick={() => chooseAll(t)}>{TIER_LABEL[t]}</button>)}
          </div>
        </div>
      )}
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <button className="btn sm" onClick={() => setOvr((x) => Object.fromEntries(rows.map((r) => [r.key, { ...x[r.key], off: false }])))}>Все</button>
        <button className="btn sm" onClick={() => setOvr((x) => Object.fromEntries(rows.map((r) => [r.key, { ...x[r.key], off: r.type === 'material' }])))}>Только работы</button>
        <button className="btn sm" onClick={() => setOvr((x) => Object.fromEntries(rows.map((r) => [r.key, { ...x[r.key], off: r.type !== 'material' }])))}>Только материалы</button>
      </div>
      {groups.map(([g, rs]) => (
        <section key={g} className="cr-group">
          <div className="cat-head"><span>{g}</span><span className="num">{rub(rs.reduce((a, r) => a + r.sum, 0))}</span></div>
          {rs.map((r) => (
            <div key={r.key} className={`cr-row ${r.on ? '' : 'off'}`}>
              <div className="cr-top">
                <input type="checkbox" checked={r.on} onChange={(e) => set(r.key, { off: !e.target.checked })} aria-label={`Включить: ${r.name}`} />
                <button className="cr-name" onClick={() => setOpen((x) => ({ ...x, [r.key]: !x[r.key] }))}>
                  {r.name}
                  <span className="xs muted"> · {TYPE_LABEL[r.type] || r.type}</span>
                </button>
                <b className="num cr-sum">{rub(r.sum)}</b>
              </div>
              {r.variants.length > 0 && r.on && (
                <div className="tier-row" role="radiogroup" aria-label={`Вариант: ${r.name}`}>
                  {r.variants.map((v) => <button key={v.tier} role="radio" aria-checked={r.tier === v.tier} className={r.tier === v.tier ? 'on' : ''} onClick={() => chooseRow(r.key, v.tier)}>{v.label}<b className="num">{rub(v.price)}</b></button>)}
                </div>
              )}
              {open[r.key] && r.composition && <div className="xs muted" style={{ padding: '2px 0 4px 30px', whiteSpace: 'pre-wrap' }}>в составе: {r.composition.split('\n').join('; ')}</div>}
              <div className="cr-grid">
                <NumInput value={r.qty} onChange={(v) => set(r.key, { qty: v }, r.baseQty)} unit={r.unit} aria-label={`Количество: ${r.name}`} />
                <NumInput value={r.price} onChange={(v) => set(r.key, { price: v })} unit={`₽/${r.unit}`} placeholder="цена" aria-label={`Цена: ${r.name}`} invalid={false} />
              </div>
              <div className="cr-meta xs">
                {r.edited || r.qtyEdited ? <span className="src edited">изменено</span> : r.src === 'own' ? <span className="src own">мой прайс</span> : r.src === 'store' ? <span className="src store">{r.type === 'material' ? 'цена магазина' : 'примерная'}</span> : <span className="src none">нет цены</span>}
                {r.type === 'material' && <ShopLink name={r.name} />}
                {r.qtyEdited && <button className="linklike" onClick={() => set(r.key, { qty: undefined })}>вернуть расчётное: {n(r.baseQty)} {r.unit}</button>}
                {r.edited && <button className="linklike" onClick={() => set(r.key, { price: undefined })}>вернуть цену</button>}
              </div>
            </div>
          ))}
        </section>
      ))}

      <div className="cr-total">
        <div className="row between"><span>Работы и техника</span><b className="num">{rub(total - mats)}</b></div>
        <div className="row between"><span>Материалы</span><b className="num">{rub(mats)}</b></div>
        <div className="row between big"><span>Итого</span><b className="num">{rub(total)}</b></div>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="В какую смету">
          <option value="new">В новую смету: {estimateTitle}</option>
          {(drafts.data || []).map((e: any) => <option key={e.id} value={e.id}>В смету: {e.title}</option>)}
        </select>
        {editedCount > 0 && (
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Запомнить мои цены ({editedCount}) в справочнике — в следующий раз подставятся они</label>
        )}
        <button className="btn primary block lg" disabled={busy} onClick={submit}>{busy ? 'Добавляю…' : `Добавить в смету · ${rub(total)}`}</button>
      </div>
    </div>
  );
}
