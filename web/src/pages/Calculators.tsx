import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CALCULATORS, CALC_GROUPS, getCalculator, runCalc } from '../../../shared/calculators';
import { get, post } from '../api';
import { useMe } from '../App';
import { Field, Icon, NumInput, Sheet, State, useLoad, useToast } from '../components/ui';
import { n, rub, parseNum, TYPE_LABEL } from '../format';
import CalcResult from '../components/CalcResult';

export { default } from './Masters';
import { COVERED_BY_MASTER } from './Masters';

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
      {COVERED_BY_MASTER[calc.id] && <Link to={`/calculators/${COVERED_BY_MASTER[calc.id]}`} className="panel" style={{ display: 'block', padding: 10, margin: '6px 0', color: 'inherit' }}><b>👷 Полный расчёт — у мастера</b><div className="xs muted">Работы, материалы и цены одной сметой</div></Link>}
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

      {priceRow && priceUnit !== '₽' && (
        <div className="crow">
          <span className="lbl boxed">Цена за {priceUnit}</span>
          <input className="cinput" inputMode="decimal" value={price} placeholder="—" onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} aria-label={`Цена за ${priceUnit}`} />
          <span className="unit">р.</span>
        </div>
      )}

      {out ? (
        <>
          <div className="box cresult" style={{ marginTop: 12 }}>
            {primary && primary.unit !== '₽' && <div className="big num">{primary.label}: {n(primary.value, 3)} {primary.unit}</div>}
            {out.rows.filter((r) => !r.primary && r.unit !== '₽').map((r, i) => <div key={i} className="num">{r.label}: {n(r.value, 3)} {r.unit}</div>)}
            {cost != null && <div className="cost num" style={{ marginTop: 6 }}>Стоимость: {rub(cost)}</div>}
          </div>
          {out.warnings.map((w, i) => <div key={i} className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{w}</div>)}
          {out.suggestions.length > 0 && (
            <CalcResult calcId={calc.id} suggestions={out.suggestions as any}
              estimateTitle={calc.id === 'fence-pro' ? `Забор: ${(calc.fields[0].options || []).find((o) => o.value === values.type)?.label || ''}, ${values.len} м` : calc.group === 'Мастера' ? `${calc.short}: ${calc.title.split(':')[0]}` : calc.title} />
          )}
          {calc.group !== 'Мастера' && (
            <details style={{ marginTop: 12 }}>
              <summary className="small muted">Как посчитано</summary>
              <div className="formula num" style={{ marginTop: 8 }}>{out.formula.map((f, i) => <div key={i}>{f}</div>)}</div>
            </details>
          )}
        </>
      ) : (
        <div className="state">Заполните параметры — результат появится сразу.</div>
      )}
    </>
  );
}
