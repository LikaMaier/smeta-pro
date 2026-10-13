import React, { useState } from 'react';
import { get, post, patch } from '../api';
import { Field, Load, NumInput, Sheet, Switch, useLoad, useToast } from './ui';
import { haptic, tg } from '../tg';

const rub = (v: number) => `${Math.round(v || 0).toLocaleString('ru-RU')} ₽`;

/** Промокоды блогеров (видно только владельцу): создать код, ссылка, кто пришёл, сколько оплатили, сколько должны блогеру */
export default function AdminPromos() {
  const toast = useToast();
  const list = useLoad(() => get<any[]>('/admin/promos'), []);
  const [form, setForm] = useState<any>(null);
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); haptic('success'); toast('Ссылка скопирована'); } catch { toast(s); } };
  const save = async () => {
    try {
      await post('/admin/promos', { code: form.code, name: form.name, contact: form.contact || null, discountPct: Number(form.discountPct) || 0, commissionPct: Number(form.commissionPct) || 0, trialDays: Number(form.trialDays) || 0 });
      setForm(null); list.reload(); haptic('success'); toast('Промокод создан');
    } catch (e: any) { toast(e.message, true); }
  };
  return (
    <>
      <h2 className="section-title">Промокоды блогеров · только для вас</h2>
      <p className="xs muted" style={{ marginTop: 0 }}>Каждому блогеру — свой код и ссылка. Подписчики получают скидку на первую оплату и длинный пробный «Про», а вы видите, сколько людей и денег привёл каждый.</p>
      <button className="btn primary block" onClick={() => setForm({ code: '', name: '', contact: '', discountPct: '20', commissionPct: '30', trialDays: '14' })}>+ Новый промокод</button>
      <Load state={list} empty={(d) => (d.length ? null : <p className="small muted">Промокодов пока нет.</p>)}>
        {(items) => (
          <div className="stack" style={{ marginTop: 10 }}>
            {items.map((p) => (
              <div key={p.id} className="panel" style={{ padding: 12, opacity: p.active ? 1 : 0.55 }}>
                <div className="row between">
                  <div><b style={{ fontSize: 18 }}>{p.code}</b> <span className="muted small">· {p.name}</span></div>
                  <Switch checked={p.active} label="Действует" onChange={async (v) => { await patch(`/admin/promos/${p.id}`, { active: v }); list.reload(); }} />
                </div>
                <div className="xs muted">скидка {p.discountPct}% · пробный «Про» {p.trialDays} дн. · блогеру {p.commissionPct}%{p.contact ? ` · ${p.contact}` : ''}</div>
                <div className="dz-sum" style={{ marginTop: 8 }}>
                  <div><span className="xs muted">Пришли</span><b>{p.users}</b></div>
                  <div><span className="xs muted">Оплатили</span><b>{p.payers}</b></div>
                  <div><span className="xs muted">Выручка</span><b className="num">{rub(p.revenue.rub)}{p.revenue.stars ? ` + ${p.revenue.stars} ⭐` : ''}</b></div>
                </div>
                <div className="small">Блогеру за всё время: <b>{rub(p.commission.rub)}{p.commission.stars ? ` + ${p.commission.stars} ⭐` : ''}</b> · в этом месяце: {rub(p.commissionMonth.rub)}{p.commissionMonth.stars ? ` + ${p.commissionMonth.stars} ⭐` : ''}</div>
                {p.link && <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn sm" onClick={() => copy(p.link)}>Скопировать ссылку</button>
                  <button className="btn sm" onClick={() => { const u = `https://t.me/share/url?url=${encodeURIComponent(p.link)}&text=${encodeURIComponent(`Ваша ссылка и промокод ${p.code} для подписчиков СМЕТА PRO`)}`; if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank'); }}>Отправить блогеру</button>
                </div>}
              </div>
            ))}
          </div>
        )}
      </Load>
      <Sheet open={!!form} onClose={() => setForm(null)} title="Новый промокод">
        {form && (
          <div className="stack">
            <Field label="Код" hint="Латиница или кириллица, цифры: STROY20, ИВАНОВ"><input className="input" value={form.code} maxLength={24} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Блогер или канал"><input className="input" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Канал «Стройка без нервов»" /></Field>
            <Field label="Контакт"><input className="input" value={form.contact} maxLength={200} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="@username, телефон" /></Field>
            <div className="grid2">
              <Field label="Скидка подписчикам"><NumInput value={form.discountPct} onChange={(v) => setForm({ ...form, discountPct: v })} unit="%" /></Field>
              <Field label="Блогеру с оплат"><NumInput value={form.commissionPct} onChange={(v) => setForm({ ...form, commissionPct: v })} unit="%" /></Field>
            </div>
            <Field label="Пробный «Про» для новичков" hint="Обычный — 7 дней"><NumInput value={form.trialDays} onChange={(v) => setForm({ ...form, trialDays: v })} unit="дн." /></Field>
            <button className="btn primary block lg" disabled={form.code.trim().length < 3 || !form.name.trim()} onClick={save}>Создать</button>
          </div>
        )}
      </Sheet>
    </>
  );
}
