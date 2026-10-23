import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useMe } from '../App';
import { NumInput, useLoad, useToast } from './ui';
import { rub, parseNum } from '../format';
import { STARTER_PRICES } from '../../../shared/starterPrices';
import { parseQuick, quickIndex, QUICK_EXAMPLES, type QuickItem } from '../../../shared/quick';
import { normName } from '../../../shared/names';

type Row = { k: number; text: string; qty: string; pick: number; alts: QuickItem[]; off: boolean };

/**
 * «Опишите работу» — как Quick Estimate в западных приложениях, но без ИИ:
 * текст → строки из справочника (свои цены важнее примерных) → проверить → «Создать смету».
 */
export default function QuickEstimate({ onBusy }: { onBusy?: (b: boolean) => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { me } = useMe();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const own = useLoad(() => get<any[]>('/items').catch(() => []), []);
  const ix = useMemo(() => {
    const mine: QuickItem[] = (own.data || []).filter((i: any) => i.active !== false && Number(i.price) > 0)
      .map((i: any) => ({ name: i.name, unit: i.unit, price: Number(i.price), category: i.category || undefined, own: !/^Примерная цена/.test(i.notes || '') }));
    const have = new Set(mine.map((i) => normName(i.name)));
    return quickIndex([...mine, ...STARTER_PRICES.filter((p) => !have.has(normName(p.name)))]);
  }, [own.data]);

  const build = () => {
    const parsed = parseQuick(text, ix);
    if (!parsed.length) return toast('Например: «ламинат 20 м², 6 розеток»', true);
    setRows(parsed.map((l, k) => ({ k, text: l.text, qty: String(l.qty), pick: l.match ? 0 : -1, alts: l.alts, off: false })));
  };
  const set = (k: number, p: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.k === k ? { ...r, ...p } : r)));
  const live = (rows || []).filter((r) => !r.off);
  const total = live.reduce((a, r) => a + (r.pick >= 0 ? r.alts[r.pick].price * parseNum(r.qty) : 0), 0);

  const create = async () => {
    if (!live.length) return;
    if (!me.access.active && !me.access.freeEstimateLeft) { nav('/settings'); return; }
    setBusy(true); onBusy?.(true);
    try {
      const first = live.find((r) => r.pick >= 0);
      const e = await post<any>('/estimates', {
        title: first ? `Смета: ${first.alts[first.pick].name.toLowerCase()}${live.length > 1 ? ' и др.' : ''}`.slice(0, 120) : 'Новая смета',
        quick: live.map((r) => (r.pick >= 0
          ? { name: r.alts[r.pick].name, qty: parseNum(r.qty), unit: r.alts[r.pick].unit, category: r.alts[r.pick].category || null }
          : { name: r.text.replace(/^./, (c) => c.toUpperCase()), qty: parseNum(r.qty) || 1, unit: 'шт', category: null })),
      });
      nav(`/estimates/${e.id}`);
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); }
    finally { setBusy(false); onBusy?.(false); }
  };

  return (
    <div className="panel quick">
      {rows ? (
        <div className="row between" style={{ alignItems: 'center' }}>
          <button className="linklike" onClick={() => setRows(null)}>← Назад</button>
          <b>Проверьте смету</b>
          <span style={{ width: 60 }} />
        </div>
      ) : <>
      <b>✍️ Что нужно сделать?</b>
      <div className="xs muted" style={{ margin: '4px 0 8px' }}>Пишите через запятую — цены подставятся сами</div>
      <textarea className="textarea" style={{ minHeight: 90 }} value={text} onChange={(e) => { setText(e.target.value); setRows(null); }}
        placeholder="Например: плитка в ванной 12 м², демонтаж старой плитки, установка унитаза, 6 розеток" aria-label="Что нужно сделать" />
      {!text && (
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          {QUICK_EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setText(x)}>{x.split(',')[0]}…</button>)}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 10 }} disabled={!text.trim()} onClick={build}>Собрать смету</button>
      </>}
      {rows && (
        <>
          <div className="list" style={{ marginTop: 10 }}>
            {rows.map((r) => {
              const it = r.pick >= 0 ? r.alts[r.pick] : null;
              return (
                <div key={r.k} className="line" style={{ opacity: r.off ? 0.45 : 1 }}>
                  <div className="xs muted">«{r.text}»</div>
                  {it ? (
                    r.alts.length > 1 ? (
                      <select className="select" value={r.pick} onChange={(e) => set(r.k, { pick: Number(e.target.value) })} aria-label="Какая работа">
                        {r.alts.map((a, i) => <option key={a.name} value={i}>{a.name}</option>)}
                      </select>
                    ) : <div className="title">{it.name}</div>
                  ) : <div className="small" style={{ color: 'var(--bad)' }}>Не нашёл — цену впишете сами</div>}
                  <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
                    <div style={{ width: 110 }}><NumInput value={r.qty} onChange={(v) => set(r.k, { qty: v })} unit={it?.unit || 'шт'} aria-label="Количество" /></div>
                    <span className="grow num" style={{ textAlign: 'right' }}>{it ? <>{rub(it.price * parseNum(r.qty))}<span className="xs muted" style={{ display: 'block' }}>по {rub(it.price)}/{it.unit}{it.own ? ' · моя цена' : ''}</span></> : '—'}</span>
                    <button className="icon-btn" aria-label={r.off ? 'Вернуть' : 'Убрать'} onClick={() => set(r.k, { off: !r.off })}>{r.off ? '↺' : '✕'}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row between" style={{ marginTop: 10 }}><span className="muted">Работы, без материалов</span><b className="num">{rub(total)}</b></div>
          <button className="btn primary block lg" style={{ marginTop: 10 }} disabled={busy || !live.length} onClick={create}>{busy ? 'Создаю…' : `Создать смету · ${live.length} поз.`}</button>
        </>
      )}
    </div>
  );
}
