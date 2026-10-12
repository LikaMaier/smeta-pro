import React, { useEffect, useMemo, useState } from 'react';
import { get, post, patch, del } from '../api';
import { Field, Icon, Load, Sheet, State, Switch, useLoad, useToast } from '../components/ui';
import { REPEAT_LABEL, REM_KINDS, WEEKDAYS, BEFORE_LABEL, kindOf } from '../../../shared/reminders';
import { confirmDialog, haptic } from '../tg';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const when = (iso: string) => {
  const d = new Date(iso);
  const today = localDate(new Date());
  const tomorrow = localDate(new Date(Date.now() + 864e5));
  const day = localDate(d) === today ? 'Сегодня' : localDate(d) === tomorrow ? 'Завтра' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
  return `${day}, ${localTime(d)}`;
};
const daysText = (s?: string | number[] | null) => (s ? String(s).split(',').map(Number).map((v) => WEEKDAYS.find((w) => w.v === v)?.t).filter(Boolean).join(', ') : '');
const repeatText = (r: any) => (r.repeat === 'days' ? daysText(r.days) || REPEAT_LABEL.days : REPEAT_LABEL[r.repeat] || '');

/** Группы по времени: просрочено → сегодня → завтра → неделя → позже */
function bucket(iso: string) {
  const d = new Date(iso), now = new Date();
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - t0.getTime()) / 864e5);
  if (d < now) return 'Просрочено';
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Завтра';
  if (days < 7) return 'На этой неделе';
  if (days < 31) return 'В этом месяце';
  return 'Позже';
}
const ORDER = ['Просрочено', 'Сегодня', 'Завтра', 'На этой неделе', 'В этом месяце', 'Позже'];

export default function Reminders() {
  const toast = useToast();
  const list = useLoad(() => get<any[]>('/reminders'), []);
  const [edit, setEdit] = useState<any>(null);
  const [kind, setKind] = useState('');
  const [showOff, setShowOff] = useState(false);

  const toggle = async (r: any, active: boolean) => {
    try {
      if (active && new Date(r.remindAt) <= new Date() && r.repeat === 'none') return setEdit(r); // нужно новое время
      await patch(`/reminders/${r.id}`, { active }); list.reload();
    } catch (e: any) { toast(e.message, true); }
  };
  const items = list.data || [];
  const kindsUsed = useMemo(() => REM_KINDS.filter((k) => items.some((r) => r.active && (r.kind || 'other') === k.id)), [items]);
  const shown = items.filter((r) => !kind || (r.kind || 'other') === kind);
  const groups = ORDER.map((g) => ({ g, items: shown.filter((r) => r.active && bucket(r.remindAt) === g) })).filter((x) => x.items.length);
  const off = shown.filter((r) => !r.active);

  const Row = ({ r }: { r: any }) => {
    const k = kindOf(r.kind);
    return (
      <div className="list-item rem-item" style={{ opacity: r.active ? 1 : 0.55 }}>
        <span className="rem-ico" aria-hidden>{k.icon}</span>
        <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'var(--text)' }} onClick={() => setEdit(r)}>
          <div className="title">{r.text}</div>
          <div className="xs muted">
            {r.active ? when(r.remindAt) : r.lastSentAt ? `Отправлено ${when(r.lastSentAt)}` : 'Выключено'}
            {r.repeat !== 'none' ? ` · 🔁 ${repeatText(r)}` : ''}{r.before ? ` · 🔔 ${BEFORE_LABEL[r.before]?.toLowerCase() || ''}` : ''}{r.project ? ` · ${r.project.name}` : ''}
          </div>
        </button>
        <Switch checked={r.active} onChange={(v) => toggle(r, v)} label="Включено" />
      </div>
    );
  };

  return (
    <>
      <div className="page-head"><button className="btn primary sm" onClick={() => setEdit({})}><Icon.plus width={18} />Напоминание</button></div>
      <p className="small muted" style={{ marginTop: 0 }}>Бот пришлёт сообщение в Telegram — с кнопками «отложить на час», «завтра» и «готово».</p>

      <div className="rem-kinds">
        {REM_KINDS.filter((k) => k.id !== 'other').map((k) => (
          <button key={k.id} className="rem-kind" onClick={() => setEdit({ kind: k.id })}><span>{k.icon}</span>{k.label}</button>
        ))}
      </div>

      {kindsUsed.length > 1 && (
        <div className="seg" style={{ margin: '10px 0' }}>
          <button className={`chip ${!kind ? 'on' : ''}`} onClick={() => setKind('')}>Все</button>
          {kindsUsed.map((k) => <button key={k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(kind === k.id ? '' : k.id)}>{k.icon} {k.label}</button>)}
        </div>
      )}

      <Load state={list} empty={(d) => (d.length ? null : <State title="Напоминаний нет" text="Выберите вид выше — например, «Деньги»: забрать оплату завтра в 10:00." action={<button className="btn primary" onClick={() => setEdit({})}>Создать напоминание</button>} />)}>
        {() => (
          <>
            {groups.map(({ g, items: its }) => (
              <React.Fragment key={g}>
                <h2 className="section-title" style={g === 'Просрочено' ? { color: 'var(--bad)' } : undefined}>{g} · {its.length}</h2>
                <div className="list">{its.map((r) => <Row key={r.id} r={r} />)}</div>
              </React.Fragment>
            ))}
            {!groups.length && <p className="small muted">Активных напоминаний нет.</p>}
            {off.length > 0 && (
              <>
                <button className="btn sm block" style={{ marginTop: 14 }} onClick={() => setShowOff(!showOff)}>{showOff ? 'Скрыть' : 'Показать'} выполненные и выключенные · {off.length}</button>
                {showOff && <div className="list" style={{ marginTop: 8 }}>{off.map((r) => <Row key={r.id} r={r} />)}</div>}
              </>
            )}
          </>
        )}
      </Load>
      <ReminderSheet r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={false} />
    </>
  );
}

export const remDayKey = (iso: string) => localDate(new Date(iso));

const QUICK: { t: string; f: () => Date }[] = [
  { t: 'Через 15 мин', f: () => new Date(Date.now() + 15 * 60e3) },
  { t: 'Через 30 мин', f: () => new Date(Date.now() + 30 * 60e3) },
  { t: 'Через час', f: () => new Date(Date.now() + 3600e3) },
  { t: 'Через 3 часа', f: () => new Date(Date.now() + 3 * 3600e3) },
  { t: 'Сегодня в 18:00', f: () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d; } },
  { t: 'Завтра в 8:00', f: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; } },
  { t: 'Завтра в 9:00', f: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { t: 'Послезавтра', f: () => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(9, 0, 0, 0); return d; } },
  { t: 'В понедельник', f: () => nextDow(1, 9) },
  { t: 'В пятницу', f: () => nextDow(5, 17) },
  { t: 'Через неделю', f: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
  { t: 'Через месяц', f: () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(9, 0, 0, 0); return d; } },
];
function nextDow(dow: number, h: number) {
  const d = new Date(); d.setHours(h, 0, 0, 0);
  let add = (dow - d.getDay() + 7) % 7; if (add === 0 && d <= new Date()) add = 7;
  d.setDate(d.getDate() + add); return d;
}
const HOURS = ['07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

export function ReminderSheet({ r, onClose, onSaved, readOnly }: { r: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const toast = useToast();
  const projects = useLoad(() => (r ? get<any[]>('/projects') : Promise.resolve([])), [!!r]);
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (!r) return setF(null);
    const k = kindOf(r.kind);
    let base = r.remindAt && new Date(r.remindAt) > new Date() ? new Date(r.remindAt) : new Date(Date.now() + 3600e3);
    if (!r.remindAt) base.setMinutes(0, 0, 0);
    if (!r.id && k.time) { // у вида своё удобное время: завтра (или сегодня, если ещё не прошло)
      const [hh, mm] = k.time.split(':').map(Number);
      const d = new Date(); d.setHours(hh, mm, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); base = d;
    }
    if (!r.id && r.date) { // создание из дня календаря: этот день, 9:00
      const d9 = new Date(`${r.date}T09:00:00`);
      base = d9 > new Date() ? d9 : r.date === localDate(new Date()) ? new Date(Date.now() + 3600e3) : d9;
    }
    setF({
      kind: r.kind || 'other', text: r.text || '', date: localDate(base), time: localTime(base),
      repeat: r.repeat || (!r.id && k.repeat) || 'none', days: r.days ? String(r.days).split(',').map(Number) : [1, 3, 5],
      before: r.before ?? (!r.id ? k.before ?? 0 : 0), projectId: r.projectId || '',
    });
  }, [r]);
  if (!r || !f) return null;
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const k = kindOf(f.kind);
  const pickKind = (id: string) => {
    const nk = kindOf(id);
    set({ kind: id, ...(r.id ? {} : { repeat: nk.repeat || 'none', before: nk.before ?? 0, ...(nk.time ? { time: nk.time } : {}) }) });
  };
  const save = async () => {
    if (!f.text.trim()) return toast('Напишите, о чём напомнить', true);
    const at = new Date(`${f.date}T${f.time}:00`); // местное время телефона → UTC
    if (Number.isNaN(at.getTime())) return toast('Проверьте дату и время', true);
    if (f.repeat === 'none' && at <= new Date()) return toast('Это время уже прошло', true);
    if (f.repeat === 'days' && !f.days.length) return toast('Выберите дни недели', true);
    const body = {
      text: f.text, remindAt: at.toISOString(), repeat: f.repeat, projectId: f.projectId || null, active: true,
      kind: f.kind, days: f.repeat === 'days' ? f.days : null, before: Number(f.before) || 0, tz: -new Date().getTimezoneOffset(),
    };
    try {
      if (r.id) await patch(`/reminders/${r.id}`, body); else await post('/reminders', body);
      haptic('success'); toast('Напоминание сохранено'); onSaved();
    } catch (e: any) { toast(e.message, true); }
  };
  return (
    <Sheet open onClose={onClose} title={r.id ? 'Напоминание' : 'Новое напоминание'}>
      <div className="stack">
        <div className="rem-kinds sm">
          {REM_KINDS.map((x) => <button key={x.id} className={`rem-kind ${f.kind === x.id ? 'on' : ''}`} onClick={() => pickKind(x.id)} aria-pressed={f.kind === x.id}><span>{x.icon}</span>{x.label}</button>)}
        </div>
        <Field label="О чём напомнить"><textarea className="textarea" style={{ minHeight: 64 }} value={f.text} onChange={(e) => set({ text: e.target.value })} readOnly={readOnly} placeholder={k.ideas[0] || 'Забрать оплату у Иванова'} /></Field>
        {!r.id && k.ideas.length > 0 && <div className="seg">{k.ideas.map((t) => <button key={t} className={`chip ${f.text === t ? 'on' : ''}`} onClick={() => set({ text: t })}>{t}</button>)}</div>}

        <div className="grid2">
          <Field label="Дата"><input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} readOnly={readOnly} /></Field>
          <Field label="Время"><input className="input" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} readOnly={readOnly} /></Field>
        </div>
        <div className="seg">{HOURS.map((h) => <button key={h} className={`chip ${f.time === h ? 'on' : ''}`} onClick={() => set({ time: h })}>{h}</button>)}</div>
        <details className="rem-quick">
          <summary>Быстро: через час, завтра, в пятницу…</summary>
          <div className="seg" style={{ marginTop: 8 }}>{QUICK.map((q) => <button key={q.t} className="chip" onClick={() => { const d = q.f(); set({ date: localDate(d), time: localTime(d) }); }}>{q.t}</button>)}</div>
        </details>

        <Field label="Повтор">
          <select className="select" value={f.repeat} onChange={(e) => set({ repeat: e.target.value })} disabled={readOnly}>
            {Object.entries(REPEAT_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Field>
        {f.repeat === 'days' && (
          <div className="seg">{WEEKDAYS.map((w) => {
            const on = f.days.includes(w.v);
            return <button key={w.v} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ days: on ? f.days.filter((x: number) => x !== w.v) : [...f.days, w.v] })}>{w.t}</button>;
          })}</div>
        )}
        <Field label="Напомнить заранее" hint="Придёт ещё одно сообщение до события">
          <select className="select" value={f.before} onChange={(e) => set({ before: Number(e.target.value) })} disabled={readOnly}>
            {Object.entries(BEFORE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Field>
        <Field label="Объект">
          <select className="select" value={f.projectId} onChange={(e) => set({ projectId: e.target.value })} disabled={readOnly}>
            <option value="">Без объекта</option>
            {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {!readOnly && <button className="btn primary block lg" onClick={save}>Сохранить</button>}
        {r.id && !readOnly && <button className="btn block danger" onClick={async () => {
          if (!(await confirmDialog('Удалить напоминание?'))) return;
          await del(`/reminders/${r.id}`); toast('Напоминание удалено'); onSaved();
        }}>Удалить</button>}
      </div>
    </Sheet>
  );
}
