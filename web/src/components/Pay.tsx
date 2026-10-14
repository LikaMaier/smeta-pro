import React, { useState } from 'react';
import { get, post } from '../api';
import { useMe } from '../App';
import { Load, useLoad, useToast } from './ui';
import { openInvoice, haptic, tg } from '../tg';

export const rub = (v: number) => `${Math.round(v || 0).toLocaleString('ru-RU')} ₽`;

/** Кнопки оплаты одного тарифа или покупки: картой/СБП (ЮKassa) и Telegram Stars.
 *  target — что именно оплачиваем (смета или 3D-проект), чтобы покупка сразу применилась к нему. */
export function PayButtons({ p, target, label, onPaid }: { p: any; target?: string | null; label?: string; onPaid?: () => void }) {
  const { me, refreshMe } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ykId, setYkId] = useState<string | null>(null);
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('smeta_pay_email') || ''; } catch { return ''; } });
  const body = target ? { target } : {};
  const rubPrice = p.price?.rub ?? p.rubPrice, stars = p.price?.stars ?? p.starsPrice;
  const done = async () => { haptic('success'); for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 1500)); await refreshMe(); } onPaid?.(); };

  const payYk = async () => {
    if (me.pay?.receipt && !/^\S+@\S+\.\S+$/.test(email)) return toast('Укажите email — на него придёт чек', true);
    setBusy(true);
    try {
      try { localStorage.setItem('smeta_pay_email', email); } catch { /* */ }
      const { url, id } = await post(`/pay/${p.code}/yookassa`, { ...body, ...(me.pay?.receipt ? { email } : {}) });
      setYkId(id);
      if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank');
      toast('Оплатите на странице ЮKassa и вернитесь — доступ включится сам');
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  const checkYk = async () => {
    if (!ykId) return;
    try { const r = await post(`/pay/yookassa/${ykId}/check`); await refreshMe(); if (r.status === 'succeeded') { toast('Оплата получена'); onPaid?.(); } else toast('Оплата ещё не поступила — попробуйте через минуту', true); }
    catch (e: any) { toast(e.message, true); }
  };
  const payStars = async () => {
    setBusy(true);
    try {
      const { url } = await post(`/pay/${p.code}`, body);
      const status = await openInvoice(url);
      if (status === 'paid') { toast('Оплата прошла, обновляю доступ…'); await done(); }
      else if (status === 'failed') toast('Оплата не прошла. Попробуйте ещё раз.', true);
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <>
      {me.pay?.yookassa && me.pay.receipt && !/^\S+@\S+\.\S+$/.test(email) && (
        <input className="input" style={{ marginTop: 8 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email для чека" aria-label="Email для чека" />
      )}
      <div className={me.pay?.yookassa ? 'grid2' : ''} style={{ marginTop: 8 }}>
        {me.pay?.yookassa && <button className="btn primary sm block" disabled={busy} onClick={payYk}>{busy ? 'Открываю…' : `${label ? `${label} · ` : ''}${rub(rubPrice)}`}</button>}
        <button className={`btn sm block ${me.pay?.yookassa ? '' : 'primary'}`} disabled={busy} onClick={payStars}>{busy && !me.pay?.yookassa ? 'Открываю…' : `${!me.pay?.yookassa && label ? `${label} · ` : ''}${stars} ⭐`}</button>
      </div>
      {ykId && <button className="btn block sm" style={{ marginTop: 6 }} onClick={checkYk}>Я оплатил(а) — проверить</button>}
    </>
  );
}

/** Несколько предложений подряд (для окон «убрать пометку», «3D-проект для заказчика») */
export function Offers({ items, target, onPaid }: { items: { code: string; title: string; text: string; best?: boolean }[]; target?: string | null; onPaid?: () => void }) {
  const { me } = useMe();
  const plans = useLoad(() => get<any[]>('/plans'), [me.plan?.tier, me.access.mode]);
  return (
    <Load state={plans}>{(list) => (
      <div className="stack">
        {items.map((it) => {
          const p = list.find((x) => x.code === it.code);
          if (!p) return null;
          const price = p.price?.rub ?? p.rubPrice;
          return (
            <div key={it.code} className={`tariff ${it.best ? 'best' : ''}`}>
              <div className="row between"><b>{it.title}</b>{p.price?.note && <span className="badge ok">{p.price.note}</span>}</div>
              <div className="tariff-price">{price < p.rubPrice && <s className="muted" style={{ marginRight: 6 }}>{rub(p.rubPrice)}</s>}<b className="num">{rub(price)}</b></div>
              <div className="xs muted">{it.text}</div>
              <PayButtons p={p} target={it.code === 'est1' || it.code === 'design1' ? target : null} onPaid={onPaid} />
            </div>
          );
        })}
      </div>
    )}</Load>
  );
}
