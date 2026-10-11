import React, { useEffect, useState } from 'react';
import { get, post, patch, del } from '../api';
import { useMe } from '../App';
import { Field, Icon, Load, Sheet, State, Switch, useLoad, useToast } from '../components/ui';
import { REPEAT_LABEL } from '../../../shared/reminders';
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
const IDEAS = ['Забрать оплату у заказчика', 'Заказать бетон', 'Позвонить заказчику', 'Вернуть технику', 'Заплатить бригаде', 'Закупить материалы', 'Выставить смету'];

export default function Reminders() {
  const { me } = useMe();
  const ro = false; // без подписки сервер ответит 402 и откроется окно с тарифами
  const toast = useToast();
  const list = useLoad(() => get<any[]>('/reminders'), []);
  const [edit, setEdit] = useState<any>(null);

  const toggle = async (r: any, active: boolean) => {
    try {
      const body: any = { active };
      if (active && new Date(r.remindAt) <= new Date() && r.repeat === 'none') return setEdit(r); // нужно новое время
      await patch(`/reminders/${r.id}`, body); list.reload();
    } catch (e: any) { toast(e.message, true); }
  };

  return (
    <>
      <div className="page-head"><button className="btn primary sm" disabled={ro} onClick={() => setEdit({})}><Icon.plus width={18} />Напоминание</button></div>
      <p className="small muted" style={{ marginTop: 0 }}>Бот пришлёт сообщение в Telegram в указанное время.</p>
      <Load state={list} empty={(d) => (d.length ? null : <State title="Напоминаний нет" text="Например: «Забрать оплату у заказчика» — завтра в 9:00." action={!ro ? <button className="btn primary" onClick={() => setEdit({})}>Создать напоминание</button> : undefined} />)}>
        {(items) => (
          <div className="list">
            {items.map((r) => (
              <div key={r.id} className="list-item" style={{ opacity: r.active ? 1 : 0.55 }}>
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'var(--text)' }} onClick={() => setEdit(r)}>
                  <div className="title">{r.text}</div>
                  <div className="xs muted">{r.active ? when(r.remindAt) : r.lastSentAt ? `Отправлено ${when(r.lastSentAt)}` : 'Выключено'} · {REPEAT_LABEL[r.repeat]}{r.project ? ` · ${r.project.name}` : ''}</div>
                </button>
                <Switch checked={r.active} onChange={(v) => toggle(r, v)} disabled={ro} label="Включено" />
              </div>
            ))}
          </div>
        )}
      </Load>
      <ReminderSheet r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={ro} />
    </>
  );
}

export const remDayKey = (iso: string) => localDate(new Date(iso));

export function ReminderSheet({ r, onClose, onSaved, readOnly }: { r: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const toast = useToast();
  const projects = useLoad(() => (r ? get<any[]>('/projects') : Promise.resolve([])), [!!r]);
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (!r) return setF(null);
    let base = r.remindAt && new Date(r.remindAt) > new Date() ? new Date(r.remindAt) : new Date(Date.now() + 3600e3);
    if (!r.remindAt) base.setMinutes(0, 0, 0);
    if (!r.id && r.date) { // создание из дня календаря: этот день, 9:00 (если день сегодня и 9:00 прошло — через час)
      const d9 = new Date(`${r.date}T09:00:00`);
      if (d9 > new Date()) base = d9; else if (r.date === localDate(new Date())) base = new Date(Date.now() + 3600e3); else base = d9;
    }
    setF({ text: r.text || '', date: localDate(base), time: localTime(base), repeat: r.repeat || 'none', projectId: r.projectId || '' });
  }, [r]);
  if (!r || !f) return null;
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const preset = (kind: 'hour' | 'eve' | 'tom9') => {
    const d = new Date();
    if (kind === 'hour') d.setHours(d.getHours() + 1);
    if (kind === 'eve') { d.setHours(18, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); }
    if (kind === 'tom9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    set({ date: localDate(d), time: localTime(d) });
  };
  const save = async () => {
    if (!f.text.trim()) return toast('Напишите, о чём напомнить', true);
    const at = new Date(`${f.date}T${f.time}:00`); // местное время телефона → UTC
    if (Number.isNaN(at.getTime())) return toast('Проверьте дату и время', true);
    if (f.repeat === 'none' && at <= new Date()) return toast('Это время уже прошло', true);
    const body = { text: f.text, remindAt: at.toISOString(), repeat: f.repeat, projectId: f.projectId || null, active: true };
    try {
      if (r.id) await patch(`/reminders/${r.id}`, body); else await post('/reminders', body);
      haptic('success'); toast('Напоминание сохранено'); onSaved();
    } catch (e: any) { toast(e.message, true); }
  };
  return (
    <Sheet open onClose={onClose} title={r.id ? 'Напоминание' : 'Новое напоминание'}>
      <div className="stack">
        <Field label="О чём напомнить"><textarea className="textarea" style={{ minHeight: 70 }} value={f.text} onChange={(e) => set({ text: e.target.value })} readOnly={readOnly} placeholder="Забрать оплату у Иванова" /></Field>
        {!r.id && <div className="seg">{IDEAS.map((t) => <button key={t} className="chip" onClick={() => set({ text: t })}>{t}</button>)}</div>}
        <div className="grid2">
          <Field label="Дата"><input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} readOnly={readOnly} /></Field>
          <Field label="Время"><input className="input" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} readOnly={readOnly} /></Field>
        </div>
        <div className="seg">
          <button className="chip" onClick={() => preset('hour')}>Через час</button>
          <button className="chip" onClick={() => preset('eve')}>Вечером в 18:00</button>
          <button className="chip" onClick={() => preset('tom9')}>Завтра в 9:00</button>
        </div>
        <Field label="Повтор">
          <select className="select" value={f.repeat} onChange={(e) => set({ repeat: e.target.value })} disabled={readOnly}>
            {Object.entries(REPEAT_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
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
