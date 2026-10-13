import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { Chips, Icon, Load, SearchBox, State, useDebounced, useLoad } from '../components/ui';
import { rub, date, EST_STATUS } from '../format';

export default function Estimates() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<'list' | 'templates'>('list');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q);
  const list = useLoad(() => get<any[]>('/estimates', { q: dq, status, template: tab === 'templates' ? '1' : '', from, to: to ? `${to}T23:59:59` : '' }), [dq, status, tab, from, to]);
  // новая смета — пошаговый выбор направления (/new)
  React.useEffect(() => { if (new URLSearchParams(location.search).get('new') === '1') nav('/new', { replace: true }); }, []); // eslint-disable-line


  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Мои сметы</h1>
        <button className="btn primary sm" onClick={() => nav('/new')}><Icon.plus width={18} />Смета</button>
      </div>
      <Chips value={tab} onChange={setTab} options={[{ value: 'list', label: 'Сметы' }, { value: 'templates', label: 'Шаблоны' }]} />
      <SearchBox value={q} onChange={setQ} placeholder="Поиск по названию, заказчику, позициям" />
      {tab === 'list' && (
        <>
          <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'Все' }, ...Object.entries(EST_STATUS).map(([value, label]) => ({ value, label }))]} />
          <div className="grid2" style={{ marginBottom: 12 }}>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По дату" />
          </div>
        </>
      )}
      <Load state={list} empty={(d) => (d.length ? null : (
        <State title={tab === 'templates' ? 'Шаблонов нет' : q || status ? 'Ничего не найдено' : 'Смет пока нет'}
          text={tab === 'templates' ? 'Откройте любую смету и сохраните её как шаблон.' : q || status ? 'Измените поиск или фильтр.' : 'Создайте первую смету.'} />
      ))}>
        {(items) => (
          <div className="list">
            {items.map((e) => (
              <Link key={e.id} to={`/estimates/${e.id}`} className="list-item">
                <div className="grow">
                  <div className="title ellipsis">{e.title}</div>
                  <div className="xs muted ellipsis">{[e.customer, e.project?.name, date(e.date), `${e.linesCount} поз.`].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="right">
                  <div className="num" style={{ fontWeight: 700 }}>{rub(e.total)}</div>
                  {!e.isTemplate && <span className="badge">{EST_STATUS[e.status]}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Load>

    </>
  );
}

/** Загрузка своей старой сметы из Excel (.xlsx) */
export function ImportButton({ onDone }: { onDone: (id: string) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true); setErr('');
    try {
      if (f.size > 8 * 1024 * 1024) throw new Error('Файл больше 8 МБ');
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Не удалось прочитать файл')); r.readAsDataURL(f); });
      const e = await post('/estimates/import', { data, fileName: f.name });
      onDone(e.id);
    } catch (e: any) { if (e.code !== 'subscription_required') setErr(e.message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <>
      <button className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Читаю файл…' : '📥 Загрузить из Excel'}</button>
      <input ref={ref} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pick(e.target.files?.[0])} />
      {err ? <div className="banner" style={{ marginTop: 8 }}>{err}</div> : <p className="xs muted" style={{ margin: '6px 0 0' }}>Своя смета в .xlsx: найдём наименования, единицы, количество, цены, разделы и «в составе».</p>}
    </>
  );
}
