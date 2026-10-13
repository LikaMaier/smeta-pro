import React, { useState } from 'react';
import { get, post, del } from '../api';
import { useMe } from '../App';
import { Field, Load, useLoad, useToast } from './ui';
import { openInvoice, haptic, tg, confirmDialog } from '../tg';
import { TIERS, SEAT_RUB, type Tier } from '../../../shared/plans';

const rub = (v: number) => `${(v || 0).toLocaleString('ru-RU')} ₽`;
const TIER_ICON: Record<string, string> = { lite: '🔹', pro: '⭐', team: '👷' };

/** Тарифы Про / Бригада (3, 5 или 10 человек), разовый эскизный проект и оплата (ЮKassa — картой и СБП, Telegram Stars) */
export default function Tariffs() {
  const { me, refreshMe } = useMe();
  const toast = useToast();
  const plans = useLoad(() => get<any[]>('/plans'), [me.promo?.code]);
  const [year, setYear] = useState(false);
  const [seats, setSeats] = useState(5);
  const [paying, setPaying] = useState('');
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('smeta_pay_email') || ''; } catch { return ''; } });
  const [ykId, setYkId] = useState<string | null>(null);
  const cur: Tier = me.plan?.tier || 'free';
  const paid = me.access.mode === 'subscription';

  const payYk = async (code: string) => {
    if (me.pay?.receipt && !/^\S+@\S+\.\S+$/.test(email)) return toast('Укажите email — на него придёт чек', true);
    setPaying(code);
    try {
      try { localStorage.setItem('smeta_pay_email', email); } catch { /* */ }
      const { url, id } = await post(`/pay/${code}/yookassa`, me.pay?.receipt ? { email } : {});
      setYkId(id);
      if (tg?.openLink) tg.openLink(url); else window.open(url, '_blank');
      toast('Оплатите на странице ЮKassa и вернитесь — доступ включится сам');
    } catch (e: any) { toast(e.message, true); } finally { setPaying(''); }
  };
  const checkYk = async () => {
    if (!ykId) return;
    try { const r = await post(`/pay/yookassa/${ykId}/check`); await refreshMe(); toast(r.status === 'succeeded' ? 'Оплата получена' : 'Оплата ещё не поступила — попробуйте через минуту', r.status !== 'succeeded'); }
    catch (e: any) { toast(e.message, true); }
  };
  const pay = async (code: string) => {
    setPaying(code);
    try {
      const { url } = await post(`/pay/${code}`);
      const status = await openInvoice(url);
      if (status === 'paid') {
        haptic('success'); toast('Оплата прошла, обновляю доступ…');
        for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 1500)); await refreshMe(); }
      } else if (status === 'failed') toast('Оплата не прошла. Попробуйте ещё раз.', true);
    } catch (e: any) { toast(e.message, true); } finally { setPaying(''); }
  };
  const Buy = ({ p, label }: { p: any; label?: string }) => (
    <div className={me.pay?.yookassa ? 'grid2' : ''} style={{ marginTop: 8 }}>
      {me.pay?.yookassa && <button className="btn primary sm block" disabled={!!paying} onClick={() => payYk(p.code)}>{paying === p.code ? 'Открываю…' : `Картой / СБП · ${rub(p.price?.rub ?? p.rubPrice)}`}</button>}
      <button className={`btn sm block ${me.pay?.yookassa ? '' : 'primary'}`} disabled={!!paying} onClick={() => pay(p.code)}>{paying === p.code && !me.pay?.yookassa ? 'Открываю…' : `${label ? `${label} · ` : ''}${p.price?.stars ?? p.starsPrice} ⭐`}</button>
    </div>
  );

  return (
    <>
      <h2 className="section-title">Тарифы</h2>
      <div className="seg" style={{ marginBottom: 8 }}>
        <button className={`chip ${!year ? 'on' : ''}`} onClick={() => setYear(false)}>На месяц</button>
        <button className={`chip ${year ? 'on' : ''}`} onClick={() => setYear(true)}>На год · −30%</button>
      </div>
      <Load state={plans}>{(list) => (
        <>
          <div className="tariffs">
            {cur === 'lite' && paid && <div className="dz-warn">У вас тариф «Лайт» — он работает до {new Date(me.access.until).toLocaleDateString('ru-RU')}. Новых подписок «Лайт» больше нет: при переходе на «Про» оставшиеся дни пересчитаются.</div>}
            {(['pro', 'team'] as const).map((t) => {
              const p = list.find((x) => x.tier === t && x.months === (year ? 12 : 1) && (t !== 'team' || (x.seats || 3) === seats));
              if (!p) return null;
              const on = cur === t && paid;
              return (
                <div key={t} className={`tariff ${t === 'pro' ? 'best' : ''} ${on ? 'on' : ''}`}>
                  <div className="row between">
                    <b className="tariff-name">{TIER_ICON[t]} {TIERS[t].label}</b>
                    {t === 'pro' && !on && <span className="badge ok">выбирают чаще</span>}
                    {on && <span className="badge ok">ваш тариф</span>}
                  </div>
                  <div className="tariff-price">
                    {p.price?.discountPct > 0 && <s className="muted" style={{ marginRight: 6 }}>{rub(year ? Math.round(p.rubPrice / 12) : p.rubPrice)}</s>}
                    <b className="num">{rub(year ? Math.round((p.price?.rub ?? p.rubPrice) / 12) : (p.price?.rub ?? p.rubPrice))}</b><span className="muted"> в месяц{year ? ` · ${rub(p.price?.rub ?? p.rubPrice)} за год` : ''}</span>
                    {p.price?.discountPct > 0 && <span className="badge ok" style={{ marginLeft: 6 }}>−{p.price.discountPct}% по промокоду</span>}
                  </div>
                  {t === 'team' && (
                    <div className="segc" role="radiogroup" aria-label="Человек в бригаде" style={{ margin: '6px 0 2px' }}>
                      {[3, 5, 10].map((n) => <button key={n} role="radio" aria-checked={seats === n} className={seats === n ? 'on' : ''} onClick={() => setSeats(n)}>до {n} чел.</button>)}
                    </div>
                  )}
                  {t === 'team' && <div className="xs muted">3 человека в базовой цене, каждый следующий — +{SEAT_RUB} ₽ в месяц</div>}
                  <ul className="tariff-perks">{TIERS[t].perks.map((x) => (t === 'team' && /^от 3 человек/.test(x) ? `до ${seats} человек, общий справочник цен` : x)).map((x) => <li key={x}>{!me.aiAvailable && /^ИИ/.test(x) ? <>{x.replace(/^ИИ-сметчик: /, 'ИИ-сметчик (').replace(/^ИИ: /, 'ИИ (')}) — <b className="soon">скоро, без доплаты</b></> : x}</li>)}</ul>
                  <Buy p={p} label={on ? 'Продлить' : undefined} />
                </div>
              );
            })}
          </div>
          {paid && <p className="xs muted">При смене тарифа или размера бригады оставшиеся дни пересчитываются по цене месяца: например, 10 дней «Про» станут 3 днями «Бригады» на 5 человек.</p>}

          <h2 className="section-title">Разово, без подписки</h2>
          <div className="list">
            {list.filter((p) => p.tier === 'pack').map((p) => (
              <div key={p.code} className="list-item" style={{ display: 'block', cursor: 'default' }}>
                <div className="title">{p.title}</div>
                <div className="xs muted">{`Полный PDF без водяного знака: 3D, план, разрез, фасады, узлы, раскрой и ведомость.${me.plan?.extraDesigns ? ` Куплено и не использовано: ${me.plan.extraDesigns}.` : ''}`}</div>
                <Buy p={p} />
              </div>
            ))}
          </div>
        </>
      )}</Load>
      {me.pay?.yookassa && me.pay.receipt && <Field label="Email для чека"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.ru" /></Field>}
      {ykId && <button className="btn block" onClick={checkYk}>Я оплатил(а) — проверить оплату</button>}
      <p className="xs muted">{me.pay?.yookassa ? 'Картой или через СБП — через ЮKassa, чек придёт на email. Или в Telegram Stars.' : 'Оплата в Telegram Stars; сумма в рублях примерная — зависит от того, где покупать звёзды.'} Доступ включается сразу после подтверждения платежа.</p>
      <PromoField />
      <TeamPanel />
    </>
  );
}

/** Промокод блогера: скидка на первую оплату подписки */
function PromoField() {
  const { me, refreshMe } = useMe();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (me.promo) return <div className="dz-warn" style={{ borderColor: 'var(--ok)' }}>🎁 Промокод <b>{me.promo.code}</b>: скидка {me.promo.discountPct}% на первую оплату подписки — уже учтена в ценах выше.</div>;
  if (me.access.mode === 'subscription') return null;
  return open ? (
    <div className="row" style={{ gap: 8, margin: '8px 0' }}>
      <input className="input grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Промокод" maxLength={24} aria-label="Промокод" />
      <button className="btn primary" disabled={busy || code.trim().length < 3} onClick={async () => {
        setBusy(true);
        try { const r = await post('/pay/promo', { code }); await refreshMe(); haptic('success'); toast(`Промокод применён: −${r.discountPct}% на первую оплату`); }
        catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
      }}>Применить</button>
    </div>
  ) : <button className="btn sm" style={{ margin: '6px 0' }} onClick={() => setOpen(true)}>🎁 Есть промокод?</button>;
}

/** Бригада: приглашение по ссылке, участники, общий справочник */
function TeamPanel() {
  const { me, refreshMe } = useMe();
  const toast = useToast();
  const team = useLoad(() => get<any>('/team'), [me.plan?.tier]);
  const [busy, setBusy] = useState(false);
  const d = team.data;
  if (!d || (d.role === 'none' && !d.members?.length)) return null;
  const act = async (f: () => Promise<any>, ok?: string) => { setBusy(true); try { await f(); if (ok) toast(ok); team.reload(); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); } };
  const share = (url: string) => {
    const text = 'Присоединяйся к нашей бригаде в СМЕТА PRO — общий справочник цен и все возможности тарифа';
    const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(link); else window.open(link, '_blank');
  };

  if (d.role === 'member') return (
    <>
      <h2 className="section-title">Бригада</h2>
      <div className="panel stack">
        <div>Вы в бригаде <b>«{d.owner}»</b>. {d.active ? 'Доступ уровня «Бригада» и общий справочник цен.' : 'У бригадира закончилась подписка.'}</div>
        <button className="btn sm danger" disabled={busy} onClick={async () => { if (await confirmDialog('Выйти из бригады? Ваши сметы и справочник останутся у вас.')) act(async () => { await post('/team/leave'); await refreshMe(); }, 'Вы вышли из бригады'); }}>Выйти из бригады</button>
      </div>
    </>
  );

  return (
    <>
      <h2 className="section-title">Бригада · {1 + d.members.length} из {d.seats}</h2>
      <div className="panel stack">
        <p className="small muted" style={{ margin: 0 }}>Пригласите до {d.seats - 1} человек: у них будут все возможности тарифа и ваш справочник цен.</p>
        {1 + d.members.length > d.seats && <div className="dz-warn">В бригаде {1 + d.members.length} чел., а тариф — на {d.seats}. Выберите тариф на больше человек или уберите лишних.</div>}
        {d.members.length > 0 && (
          <div className="list">
            {d.members.map((m: any) => (
              <div key={m.id} className="list-item">
                <div className="grow title">👷 {m.name}</div>
                <button className="btn sm" disabled={busy} onClick={async () => { if (await confirmDialog(`Убрать ${m.name} из бригады?`)) act(() => del(`/team/members/${m.id}`), 'Участник убран'); }}>Убрать</button>
              </div>
            ))}
          </div>
        )}
        {d.role === 'owner' && 1 + d.members.length < d.seats && (
          <button className="btn primary block" disabled={busy} onClick={() => act(async () => { const r = d.inviteUrl ? { url: d.inviteUrl } : await post('/team/invite'); share(r.url); })}>📨 Пригласить в бригаду</button>
        )}
        {d.role === 'owner' && d.members.length > 0 && (
          <button className="btn block" disabled={busy} onClick={() => act(async () => { const r = await post('/team/push-prices'); toast(`Справочник (${r.items} позиций) отправлен: ${r.members} чел.`); })}>🔄 Разослать справочник бригаде</button>
        )}
        {d.role === 'owner' && d.inviteUrl && <button className="btn sm" disabled={busy} onClick={() => act(() => post('/team/invite/reset'), 'Старая ссылка больше не работает')}>Сделать новую ссылку</button>}
        {d.role !== 'owner' && <p className="xs muted">Тариф «Бригада» закончился — участники пока без доступа.</p>}
      </div>
    </>
  );
}
