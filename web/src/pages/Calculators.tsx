import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CALCULATORS, CALC_GROUPS, getCalculator, runCalc } from '../../../shared/calculators';
import { get, post } from '../api';
import { useMe } from '../App';
import { Field, Icon, NumInput, Sheet, State, useLoad, useToast } from '../components/ui';
import { n, rub, parseNum, TYPE_LABEL } from '../format';

export default function Calculators() {
  return (
    <>
      {CALC_GROUPS.map((g) => (
        <section key={g}>
          <div className="tile-group">{g}</div>
          <div className="tiles">
            {CALCULATORS.filter((c) => c.group === g).map((c) => (
              <Link key={c.id} to={`/calculators/${c.id}`} className="tile" style={{ minHeight: 92 }}>{c.short || c.title}</Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

const storeKey = (id: string) => `smeta_calc_${id}`;
const load = (id: string) => { try { return JSON.parse(localStorage.getItem(storeKey(id)) || '{}'); } catch { return {}; } };

export function CalculatorPage() {
  const { id } = useParams();
  const calc = getCalculator(id || '');
  const saved = useMemo(() => load(id || ''), [id]);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const d: Record<string, any> = {};
    calc?.fields.forEach((f) => (d[f.key] = f.default ?? ''));
    return { ...d, ...(saved.values || saved) };
  });
  const [price, setPrice] = useState<string>(saved.price ?? '');
  const [touched, setTouched] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(storeKey(id || ''), JSON.stringify({ values, price })); } catch { /* */ } }, [values, price, id]);

  const res = useMemo(() => {
    if (!calc) return null;
    try { return runCalc(calc, values); } catch (e: any) { return { errors: { _: e.message }, output: null }; }
  }, [calc, values]);
  if (!calc) return <State title="Калькулятор не найден" />;
  const out = res?.output;
  const priceIdx = calc.priceRow ?? Math.max(0, out?.rows.findIndex((r) => r.primary) ?? 0);
  const priceRow = out?.rows[priceIdx];
  const priceUnit = priceRow?.unit.replace(/^шт.*/, 'шт') || '';
  const cost = priceRow && parseNum(price) > 0 ? Math.round(priceRow.value * parseNum(price) * 100) / 100 : null;
  const primary = out?.rows.find((r) => r.primary);

  return (
    <>
      <div className="box" style={{ marginBottom: 4 }}>{calc.title}</div>
      {calc.fields.map((f) => {
        const err = touched || values[f.key] !== '' ? res?.errors[f.key] : undefined;
        const set = (v: any) => { setValues((x) => ({ ...x, [f.key]: v })); setTouched(true); };
        return (
          <div className="crow" key={f.key}>
            <label className="lbl" htmlFor={`f_${f.key}`}>{f.label}</label>
            {f.type === 'select' ? (
              <select id={`f_${f.key}`} className="cinput" value={values[f.key]} onChange={(e) => set(e.target.value)} style={{ gridColumn: 'span 2' }}>
                {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'text' ? (
              <input id={`f_${f.key}`} className={`cinput ${err ? 'invalid' : ''}`} style={{ gridColumn: 'span 2', fontSize: 20 }} value={values[f.key]} onChange={(e) => set(e.target.value)} />
            ) : (
              <input id={`f_${f.key}`} className={`cinput ${err ? 'invalid' : ''}`} inputMode="decimal" value={values[f.key] ?? ''} placeholder={f.optional ? '—' : ''}
                onChange={(e) => set(e.target.value.replace(/[^\d.,\-]/g, ''))} />
            )}
            {f.type !== 'select' && f.type !== 'text' && <span className="unit" style={(f.unit?.length || 0) > 3 ? { fontSize: 13 } : undefined}>{f.unit || ''}</span>}
            {err ? <div className="cerr">{err}</div> : f.hint ? <div className="chint">{f.hint}</div> : null}
          </div>
        );
      })}

      {priceRow && (
        <div className="crow">
          <span className="lbl boxed">Цена за {priceUnit}</span>
          <input className="cinput" inputMode="decimal" value={price} placeholder="—" onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} aria-label={`Цена за ${priceUnit}`} />
          <span className="unit">р.</span>
        </div>
      )}

      {out ? (
        <>
          <div className="box cresult" style={{ marginTop: 12 }}>
            {primary && <div className="big num">{primary.label}: {n(primary.value, 3)} {primary.unit}</div>}
            {out.rows.filter((r) => !r.primary).map((r, i) => <div key={i} className="num">{r.label}: {n(r.value, 3)} {r.unit}</div>)}
            {cost != null && <div className="cost num" style={{ marginTop: 6 }}>Стоимость: {rub(cost)}</div>}
          </div>
          <div className="csection">Как посчитано</div>
          <div className="formula num" style={{ marginTop: 8 }}>{out.formula.map((f, i) => <div key={i}>{f}</div>)}</div>
          {out.warnings.map((w, i) => <div key={i} className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{w}</div>)}
          {out.suggestions.length > 0 && <button className="btn primary block lg" style={{ marginTop: 16 }} onClick={() => setAddOpen(true)}><Icon.plus width={20} />Добавить в смету</button>}
          <AddToEstimate open={addOpen} onClose={() => setAddOpen(false)} suggestions={out.suggestions} />
        </>
      ) : (
        <div className="state">Заполните параметры — результат появится сразу.</div>
      )}
    </>
  );
}

function AddToEstimate({ open, onClose, suggestions }: { open: boolean; onClose: () => void; suggestions: any[] }) {
  const nav = useNavigate();
  const toast = useToast();
  const { me } = useMe();
  const estimates = useLoad(() => (open ? get<any[]>('/estimates', { status: 'draft' }) : Promise.resolve([])), [open]);
  const items = useLoad(() => (open ? get<any[]>('/items') : Promise.resolve([])), [open]);
  const [rows, setRows] = useState<any[]>([]);
  const [target, setTarget] = useState('new');
  const [busy, setBusy] = useState(false);

  // Цена по личному прайс-листу: ищем позицию с похожим названием и тем же типом
  useEffect(() => {
    if (!open) return;
    const cat = items.data || [];
    setRows(suggestions.map((s) => {
      const base = s.name.toLowerCase().split(/[\s(]/)[0];
      const match = cat.find((i) => i.type === s.type && i.name.toLowerCase().includes(base));
      return { ...s, on: true, price: match ? String(match.price) : '', costPrice: match?.costPrice ?? null, unit: s.unit, catalogItemId: match?.id || null, matched: match?.name, category: match?.category || null };
    }));
  }, [open, items.data, suggestions]);

  const total = rows.filter((r) => r.on).reduce((a, r) => a + parseNum(r.price) * r.qty, 0);
  const submit = async () => {
    const lines = rows.filter((r) => r.on).map((r) => ({ name: r.matched || r.name, qty: r.qty, unit: r.unit, price: parseNum(r.price), costPrice: r.costPrice, type: r.type, category: r.category, catalogItemId: r.catalogItemId }));
    if (!lines.length) return toast('Отметьте хотя бы одну позицию', true);
    setBusy(true);
    try {
      let id = target;
      if (target === 'new') id = (await post('/estimates', { title: 'Новая смета' })).id;
      await post(`/estimates/${id}/lines`, { lines });
      toast('Добавлено в смету');
      nav(`/estimates/${id}`);
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Добавить в смету">
      <div className="stack">
        <Field label="Смета">
          <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">Новая смета</option>
            {(estimates.data || []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </Field>
        <div className="list">
          {rows.map((r, i) => (
            <div key={i} className="line">
              <label className="row"><input type="checkbox" checked={r.on} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y)))} />
                <span className="grow"><b>{r.matched || r.name}</b><div className="xs muted">{n(r.qty, 3)} {r.unit} · {TYPE_LABEL[r.type]}{r.matched ? ' · цена из справочника' : ' · нет в справочнике'}</div></span></label>
              <div style={{ marginTop: 6 }}><NumInput value={r.price} onChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, price: v } : y)))} unit={`₽/${r.unit}`} placeholder="Цена" /></div>
            </div>
          ))}
        </div>
        <div className="row between"><span className="muted">Стоимость</span><b className="num">{rub(Math.round(total * 100) / 100)}</b></div>
        {rows.some((r) => r.on && !r.price) && <p className="xs muted">Позиции без цены добавятся с ценой 0 — заполните её в смете.</p>}
        <button className="btn primary block lg" onClick={submit} disabled={busy || !me.access.active}>{busy ? 'Добавляю…' : 'Добавить'}</button>
      </div>
    </Sheet>
  );
}
