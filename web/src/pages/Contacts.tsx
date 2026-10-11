import React, { useEffect, useState } from 'react';
import { get, post, patch, del } from '../api';
import { useMe } from '../App';
import { Chips, Field, Icon, Load, SearchBox, Sheet, State, useDebounced, useLoad, useToast } from '../components/ui';
import { confirmDialog, tg } from '../tg';

export const CONTACT_CAT: Record<string, string> = { customer: 'Заказчик', equipment: 'Техника', supplier: 'Поставщик', worker: 'Рабочий', other: 'Прочее' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayTitle = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;

export default function Contacts() {
  const { me } = useMe();
  const ro = false; // без подписки сервер ответит 402 и откроется окно с тарифами
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const dq = useDebounced(q);
  const list = useLoad(() => get<any[]>('/contacts', { q: dq, category: cat }), [dq, cat]);
  const [edit, setEdit] = useState<any>(null);

  return (
    <>
      <div className="page-head"><button className="btn primary sm" disabled={ro} onClick={() => setEdit({})}><Icon.plus width={18} />Запись</button></div>
      <SearchBox value={q} onChange={setQ} placeholder="Имя, телефон или заметка" />
      <Chips value={cat} onChange={setCat} options={[{ value: '', label: 'Все' }, ...Object.entries(CONTACT_CAT).map(([value, label]) => ({ value, label }))]} />
      <Load state={list} empty={(d) => (d.length ? null : <State title={q || cat ? 'Ничего не найдено' : 'Записная книжка пуста'} text={q || cat ? undefined : 'Записывайте телефоны заказчиков, техники и поставщиков — с датой, когда договорились.'} />)}>
        {(items) => {
          const groups = new Map<string, any[]>();
          items.forEach((c) => { const k = c.date.slice(0, 10); groups.set(k, [...(groups.get(k) || []), c]); });
          return (
            <>
              {[...groups].map(([k, cs]) => (
                <section key={k}>
                  <div className="tile-group">{dayTitle(k)}</div>
                  <div className="list">
                    {cs.map((c) => (
                      <div key={c.id} className="list-item">
                        <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'var(--text)' }} onClick={() => setEdit(c)}>
                          <div className="title ellipsis">{c.name}</div>
                          <div className="xs muted ellipsis">{[CONTACT_CAT[c.category], c.phone, c.project?.name, c.note].filter(Boolean).join(' · ')}</div>
                        </button>
                        {c.phone && <a className="btn sm primary" href={telHref(c.phone)} onClick={(e) => { if (tg?.openLink) { e.preventDefault(); tg.openLink(telHref(c.phone)); } }} aria-label={`Позвонить ${c.name}`}>📞</a>}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          );
        }}
      </Load>
      <ContactSheet c={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={ro} />
    </>
  );
}

export const telLink = telHref;

export function ContactSheet({ c, onClose, onSaved, readOnly }: { c: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const toast = useToast();
  const projects = useLoad(() => (c ? get<any[]>('/projects') : Promise.resolve([])), [!!c]);
  const [f, setF] = useState<any>(null);
  useEffect(() => setF(c ? { name: c.name || '', phone: c.phone || '', category: c.category || 'customer', note: c.note || '', date: c.date ? c.date.slice(0, 10) : today(), projectId: c.projectId || '' } : null), [c]);
  if (!c || !f) return null;
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const save = async () => {
    if (!f.name.trim()) return toast('Введите имя или название', true);
    const body = { ...f, phone: f.phone || null, note: f.note || null, projectId: f.projectId || null };
    try {
      if (c.id) await patch(`/contacts/${c.id}`, body); else await post('/contacts', body);
      toast('Сохранено'); onSaved();
    } catch (e: any) { toast(e.message, true); }
  };
  return (
    <Sheet open onClose={onClose} title={c.id ? 'Контакт' : 'Новая запись'}>
      <div className="stack">
        <Field label="Кто это"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Иван, экскаватор JCB" readOnly={readOnly} /></Field>
        <Field label="Телефон"><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+7 900 000-00-00" readOnly={readOnly} /></Field>
        <div className="seg">{Object.entries(CONTACT_CAT).map(([v, t]) => <button key={v} className={`chip ${f.category === v ? 'on' : ''}`} onClick={() => !readOnly && set({ category: v })}>{t}</button>)}</div>
        <div className="grid2">
          <Field label="Дата"><input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} readOnly={readOnly} /></Field>
          <Field label="Объект">
            <select className="select" value={f.projectId} onChange={(e) => set({ projectId: e.target.value })} disabled={readOnly}>
              <option value="">—</option>
              {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Заметка"><textarea className="textarea" style={{ minHeight: 80 }} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Смена 18 000 ₽, доставка 3 000 ₽" readOnly={readOnly} /></Field>
        {!readOnly && <button className="btn primary block lg" onClick={save}>Сохранить</button>}
        {c.id && !readOnly && <button className="btn block danger" onClick={async () => {
          if (!(await confirmDialog(`Удалить «${f.name}»?`))) return;
          await del(`/contacts/${c.id}`); toast('Удалено'); onSaved();
        }}>Удалить</button>}
      </div>
    </Sheet>
  );
}
