import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { get, post, patch, del } from '../api';
import { useMe } from '../App';
import { Field, Icon, Load, Sheet, State, useLoad, useToast } from '../components/ui';
import { monthGrid } from '../../../shared/calendar';
import { rub, rub0, INCOME_TYPE, groupLabel } from '../format';
import { preparePhoto } from '../photo';
import { confirmDialog, haptic } from '../tg';
import { OpSheet } from './ProjectPage';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const shiftMonth = (m: string, k: number) => {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthTitle = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS = ['я', 'ф', 'м', 'а', 'м', 'и', 'и', 'а', 'с', 'о', 'н', 'д'];
const short = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}к` : String(Math.round(v)));
const PROJECT_KEY = 'smeta_cal_project';

export default function Calendar() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const month = sp.get('m') || todayKey().slice(0, 7);
  const [projectId, setProjectId] = useState(sp.get('p') || '');
  const projects = useLoad(() => get<any[]>('/projects'), []);
  const data = useLoad(() => get<any>('/calendar', { month, projectId }), [month, projectId]);
  const go = (m: string) => setSp({ m, ...(projectId ? { p: projectId } : {}) }, { replace: true });
  const today = todayKey();

  return (
    <>
      <div className="cal-head">
        <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => go(shiftMonth(month, -1))}><Icon.back /></button>
        <b>{monthTitle(month)}</b>
        <button className="icon-btn" aria-label="Следующий месяц" onClick={() => go(shiftMonth(month, 1))}><Icon.chevron /></button>
      </div>
      <select className="select" style={{ marginBottom: 10 }} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Объект">
        <option value="">Все объекты</option>
        {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <Load state={data}>{(d) => (
        <>
          <div className="box cresult" style={{ marginBottom: 10 }}>
            <div className={`big num ${d.total.earned < 0 ? 'neg' : ''}`}>Заработано: {rub(d.total.earned)}</div>
            <div className="sub num">Получено {rub(d.total.received)} · потрачено {rub(d.total.spent)}</div>
            {d.total.unpaid > 0 && <div className="sub num" style={{ color: 'var(--bad)' }}>Не оплачено поставщикам и рабочим: {rub(d.total.unpaid)}</div>}
          </div>

          <div className="cal-grid">
            {WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}
            {monthGrid(Number(month.slice(0, 4)), Number(month.slice(5, 7))).flat().map((day, i) => {
              if (!day) return <div key={i} className="cal-day empty" />;
              const info = d.days[day];
              const has = info && (info.photos || info.logs || info.received || info.spent);
              return (
                <button key={day} className={`cal-day ${day === today ? 'today' : ''} ${has ? 'has' : ''}`} onClick={() => nav(`/calendar/${day}${projectId ? `?p=${projectId}` : ''}`)}>
                  <span className="d">{Number(day.slice(8))}</span>
                  {info?.received || info?.spent ? <span className={`m ${info.earned < 0 ? 'neg' : 'pos'}`}>{info.earned > 0 ? '+' : ''}{short(info.earned)}</span> : null}
                  <span className="marks">{info?.photos ? <span>📷{info.photos}</span> : null}{info?.logs ? <span>✎{info.logs}</span> : null}</span>
                </button>
              );
            })}
          </div>
          <p className="xs muted">Нажмите на день, чтобы добавить фото, запись о работе, поступление или расход.</p>

          {d.projects.length > 0 && (
            <>
              <h2 className="section-title">По объектам за месяц</h2>
              <div className="list">
                {d.projects.map((p: any) => (
                  <Link key={p.id || 'none'} to={p.id ? `/projects/${p.id}` : '#'} className="list-item">
                    <div className="grow"><div className="title ellipsis">{p.name}</div><div className="xs muted">получено {rub0(p.received)} · потрачено {rub0(p.spent)}</div></div>
                    <b className={`num ${p.earned < 0 ? 'neg' : 'pos'}`}>{rub0(p.earned)}</b>
                  </Link>
                ))}
              </div>
            </>
          )}

          <h2 className="section-title">За {month.slice(0, 4)} год: {rub0(d.year.total.earned)}</h2>
          <div className="panel">
            <YearBars months={d.year.months} current={Number(month.slice(5, 7)) - 1} onPick={(i) => go(`${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`)} />
            <div className="row between xs muted" style={{ marginTop: 8 }}><span>получено {rub0(d.year.total.received)}</span><span>потрачено {rub0(d.year.total.spent)}</span></div>
          </div>
        </>
      )}</Load>
    </>
  );
}

function YearBars({ months, current, onPick }: { months: any[]; current: number; onPick: (i: number) => void }) {
  const max = Math.max(1, ...months.map((m) => Math.abs(m.earned)));
  return (
    <div className="bars" role="list" aria-label="Заработок по месяцам">
      {months.map((m, i) => (
        <div key={i} role="listitem" title={`${i + 1}: ${rub0(m.earned)}`} onClick={() => onPick(i)} style={{ cursor: 'pointer' }}>
          <i className={m.earned < 0 ? 'neg' : ''} style={{ height: `${(Math.abs(m.earned) / max) * 85}%`, opacity: i === current ? 1 : 0.55 }} />
          <span style={{ color: i === current ? 'var(--accent)' : undefined }}>{MONTHS[i]}</span>
        </div>
      ))}
    </div>
  );
}

export function CalendarDay() {
  const { date } = useParams();
  const [sp] = useSearchParams();
  const toast = useToast();
  const { me } = useMe();
  const ro = false; // без подписки сервер ответит 402 и откроется окно с тарифами
  const projects = useLoad(() => get<any[]>('/projects'), []);
  const [projectId, setProjectIdState] = useState<string>(() => {
    try { return sp.get('p') || localStorage.getItem(PROJECT_KEY) || ''; } catch { return sp.get('p') || ''; }
  });
  const setProjectId = (v: string) => { setProjectIdState(v); try { localStorage.setItem(PROJECT_KEY, v); } catch { /* */ } };
  useEffect(() => { // выбранный объект мог быть удалён
    if (projects.data && projectId && !projects.data.some((p) => p.id === projectId)) setProjectId('');
  }, [projects.data]); // eslint-disable-line
  const day = useLoad(() => get<any>('/calendar/day', { date }), [date]);
  const [uploading, setUploading] = useState<string>('');
  const [viewer, setViewer] = useState<any>(null);
  const [logOpen, setLogOpen] = useState<any>(null);
  const [op, setOp] = useState<any>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      setUploading(`Загружаю фото ${i + 1} из ${list.length}…`);
      try {
        const { image, thumb } = await preparePhoto(list[i]);
        await post('/photos', { date, projectId: projectId || null, image, thumb });
        ok++;
      } catch (e: any) { toast(e.message || 'Фото не загрузилось', true); }
    }
    setUploading('');
    if (ok) { haptic('success'); toast(ok === 1 ? 'Фото добавлено' : `Добавлено фото: ${ok}`); day.reload(); }
    if (camRef.current) camRef.current.value = '';
    if (galRef.current) galRef.current.value = '';
  };
  const needProject = (kind: string) => {
    if (!projectId) return toast('Сначала выберите объект — деньги учитываются по объектам', true);
    setOp({ kind, date });
  };
  const nice = new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="box" style={{ marginBottom: 10 }}>{nice.charAt(0).toUpperCase() + nice.slice(1).replace(' г.', '')}</div>
      <Field label="Объект для новых записей">
        <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={ro}>
          <option value="">Без объекта</option>
          {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

      {!ro && (
        <div className="tiles" style={{ marginTop: 10 }}>
          <button className="tile" style={{ minHeight: 78 }} onClick={() => camRef.current?.click()} disabled={!!uploading}>📷 Снять фото</button>
          <button className="tile" style={{ minHeight: 78 }} onClick={() => galRef.current?.click()} disabled={!!uploading}>Из галереи</button>
          <button className="tile" style={{ minHeight: 78 }} onClick={() => setLogOpen({})}>Запись о работе</button>
          <button className="tile" style={{ minHeight: 78 }} onClick={() => needProject('income')}>+ Получил деньги</button>
          <button className="tile wide" style={{ minHeight: 70 }} onClick={() => needProject('expense')}>− Потратил</button>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      {uploading && <div className="banner" style={{ marginTop: 10 }}>{uploading}</div>}

      <Load state={day}>{(d) => (
        <>
          <div className="box cresult" style={{ marginTop: 12 }}>
            <div className={`big num ${d.total.earned < 0 ? 'neg' : ''}`}>За день: {rub(d.total.earned)}</div>
            <div className="sub num">Получено {rub(d.total.received)} · потрачено {rub(d.total.spent)}</div>
          </div>

          <h2 className="section-title">Фото{d.photos.length ? ` (${d.photos.length})` : ''}</h2>
          {d.photos.length ? (
            <div className="photo-grid">
              {d.photos.map((p: any) => <button key={p.id} onClick={() => setViewer(p)} aria-label={p.caption || 'Фото'}><img src={p.thumbUrl} alt={p.caption || ''} loading="lazy" /></button>)}
            </div>
          ) : <p className="small muted">Фото за этот день нет. Снимите объект до и после работ — пригодится для отчёта заказчику.</p>}

          <h2 className="section-title">Журнал работ</h2>
          {d.logs.length ? (
            <div className="list">
              {d.logs.map((l: any) => (
                <button key={l.id} className="list-item" onClick={() => setLogOpen(l)}>
                  <div className="grow"><div style={{ whiteSpace: 'pre-wrap' }}>{l.text}</div>{l.project && <div className="xs muted">{l.project.name}</div>}</div>
                </button>
              ))}
            </div>
          ) : <p className="small muted">Что сделали сегодня: «залили площадку», «завезли щебень 10 т».</p>}

          <h2 className="section-title">Деньги</h2>
          {d.ops.length ? (
            <div className="list">
              {d.ops.map((o: any) => (
                <button key={o.id} className="list-item" onClick={() => setOp(o)}>
                  <div className="grow"><div className="title ellipsis">{o.title}</div><div className="xs muted">{o.project?.name} · {o.kind === 'income' ? INCOME_TYPE[o.incomeType] : groupLabel(o.category)}</div></div>
                  <b className={`num ${o.kind === 'income' ? 'pos' : ''}`}>{o.kind === 'income' ? '+' : '−'}{rub(Math.abs(o.kind === 'income' ? o.amount : o.paidAmount))}</b>
                </button>
              ))}
            </div>
          ) : <p className="small muted">Движения денег в этот день нет.</p>}
        </>
      )}</Load>

      {viewer && <PhotoViewer photo={viewer} projects={projects.data || []} readOnly={ro} onClose={() => setViewer(null)} onChanged={() => { setViewer(null); day.reload(); }} />}
      <LogSheet log={logOpen} date={date!} projectId={projectId} readOnly={ro} onClose={() => setLogOpen(null)} onSaved={() => { setLogOpen(null); day.reload(); }} />
      <OpSheet op={op} projectId={op?.projectId || projectId} readOnly={ro} onClose={() => setOp(null)} onSaved={() => { setOp(null); day.reload(); }} />
    </>
  );
}

function PhotoViewer({ photo, projects, readOnly, onClose, onChanged }: { photo: any; projects: any[]; readOnly: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [caption, setCaption] = useState(photo.caption || '');
  const [projectId, setProjectId] = useState(photo.projectId || '');
  const dirty = caption !== (photo.caption || '') || projectId !== (photo.projectId || '');
  return (
    <div className="viewer" role="dialog" aria-modal="true">
      <div className="bar"><button className="icon-btn" aria-label="Закрыть" onClick={onClose}><Icon.close /></button><span className="grow small muted">{photo.project?.name || 'Без объекта'}</span>
        <a className="btn sm" href={photo.url} target="_blank" rel="noreferrer">Открыть</a></div>
      <img src={photo.url} alt={photo.caption || 'Фото объекта'} />
      <div className="bar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Подпись: что на фото" readOnly={readOnly} />
        <div className="row">
          <select className="select grow" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={readOnly}>
            <option value="">Без объекта</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!readOnly && dirty && <button className="btn primary" onClick={async () => { await patch(`/photos/${photo.id}`, { caption: caption || null, projectId: projectId || null }); toast('Сохранено'); onChanged(); }}>Сохранить</button>}
          {!readOnly && <button className="icon-btn" aria-label="Удалить фото" onClick={async () => {
            if (!(await confirmDialog('Удалить фото?'))) return;
            await del(`/photos/${photo.id}`); toast('Фото удалено'); onChanged();
          }}><Icon.trash /></button>}
        </div>
      </div>
    </div>
  );
}

function LogSheet({ log, date, projectId, readOnly, onClose, onSaved }: { log: any; date: string; projectId: string; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  useEffect(() => setText(log?.text || ''), [log]);
  if (!log) return null;
  const save = async () => {
    if (!text.trim()) return toast('Напишите, что сделано', true);
    try {
      if (log.id) await patch(`/worklogs/${log.id}`, { text });
      else await post('/worklogs', { date, projectId: projectId || null, text });
      toast('Запись сохранена'); onSaved();
    } catch (e: any) { toast(e.message, true); }
  };
  return (
    <Sheet open onClose={onClose} title={log.id ? 'Запись о работе' : 'Новая запись'}>
      <div className="stack">
        <textarea className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Залили площадку 6×4, бетон М300 3,8 м³" readOnly={readOnly} />
        {!readOnly && <button className="btn primary block lg" onClick={save}>Сохранить</button>}
        {log.id && !readOnly && <button className="btn block danger" onClick={async () => {
          if (!(await confirmDialog('Удалить запись?'))) return;
          await del(`/worklogs/${log.id}`); toast('Запись удалена'); onSaved();
        }}>Удалить</button>}
      </div>
    </Sheet>
  );
}

export { State };
