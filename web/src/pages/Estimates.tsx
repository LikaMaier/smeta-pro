import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post, del } from '../api';
import { confirmDialog, haptic } from '../tg';
import { Chips, Icon, Load, SearchBox, State, useDebounced, useLoad, useToast } from '../components/ui';
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
  // выбор и удаление смет
  const toast = useToast();
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string[] | null>(null);
  const toggle = (id: string) => setSel((x) => { const c = new Set(x || []); c.has(id) ? c.delete(id) : c.add(id); return c; });
  const removeIds = async (ids: string[]) => {
    if (!ids.length) return;
    const word = ids.length === 1 ? 'смету' : `сметы (${ids.length})`;
    if (!(await confirmDialog(`Удалить ${word}? Сразу после удаления можно нажать «Вернуть».`))) return;
    setBusy(true);
    const done: string[] = [];
    for (const id of ids) { try { await del(`/estimates/${id}`); done.push(id); } catch { /* пропускаем */ } }
    setBusy(false); setSel(null); haptic('medium');
    if (done.length < ids.length) toast(`Не удалось удалить: ${ids.length - done.length}`, true);
    if (done.length) { setUndo(done); window.setTimeout(() => setUndo((u) => (u === done ? null : u)), 8000); }
    list.reload?.();
  };
  const restore = async () => {
    const ids = undo || [];
    setUndo(null);
    for (const id of ids) { try { await post(`/estimates/${id}/restore`, {}); } catch { /* ок */ } }
    toast('Вернула'); list.reload?.();
  };
  // новая смета — пошаговый выбор направления (/new)
  React.useEffect(() => { if (new URLSearchParams(location.search).get('new') === '1') nav('/new', { replace: true }); }, []); // eslint-disable-line


  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Мои сметы</h1>
        <div className="row" style={{ gap: 6 }}>
          {(list.data?.length ?? 0) > 0 && <button className="btn sm" onClick={() => setSel((x) => (x ? null : new Set()))}>{sel ? 'Отмена' : 'Выбрать'}</button>}
          {!sel && <button className="btn primary sm" onClick={() => nav('/new')}><Icon.plus width={18} />Смета</button>}
        </div>
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
            {sel && (
              <button className="list-item est-selall" onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map((e) => e.id)))}>
                <span className={`est-box ${sel.size === items.length ? 'on' : ''}`}>{sel.size === items.length ? '✓' : ''}</span>
                <div className="grow muted">{sel.size === items.length ? 'Снять выбор' : 'Выбрать все'}</div>
              </button>
            )}
            {items.map((e) => sel ? (
              <button key={e.id} className={`list-item ${sel.has(e.id) ? 'est-on' : ''}`} onClick={() => toggle(e.id)} aria-pressed={sel.has(e.id)}>
                <span className={`est-box ${sel.has(e.id) ? 'on' : ''}`}>{sel.has(e.id) ? '✓' : ''}</span>
                <div className="grow">
                  <div className="title ellipsis">{e.title}</div>
                  <div className="xs muted ellipsis">{[e.customer, date(e.date), `${e.linesCount} поз.`].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="num" style={{ fontWeight: 700 }}>{rub(e.total)}</div>
              </button>
            ) : (
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
      {(sel || undo) && <div style={{ height: 76 }} />}
      {sel && (
        <div className="est-bar">
          <span>Выбрано: <b>{sel.size}</b></span>
          <button className="btn danger" disabled={!sel.size || busy} onClick={() => removeIds([...sel])}><Icon.trash width={18} />{busy ? 'Удаляю…' : 'Удалить'}</button>
        </div>
      )}
      {undo && !sel && (
        <div className="est-bar">
          <span>Удалено смет: <b>{undo.length}</b></span>
          <button className="btn" onClick={restore}>Вернуть</button>
        </div>
      )}
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
