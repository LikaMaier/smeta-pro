import React, { useState } from 'react';
import { get, post, del } from '../api';
import { useMe } from '../App';
import { Load, useLoad, useToast } from './ui';
import { openInvoice, haptic, tg, confirmDialog } from '../tg';
import { TIERS, SEAT_RUB, PRICES, type Tier } from '../../../shared/plans';
import { PayButtons, rub } from './Pay';

const TIER_ICON: Record<string, string> = { lite: '🔹', pro: '⭐', team: '👷' };
const PACK_TEXT: Record<string, string> = {
  est10: `10 смет без пометки, с вашим логотипом. Действуют ${PRICES.packMonths} месяцев — удобно, если заказы бывают не каждый месяц.`,
  design1: 'Премиальный 3D-проект одного объекта для заказчика: PDF без водяного знака (3D, план, фасады, узлы, ведомость) и 3D-ссылка, которую заказчик крутит пальцем. Включите его в смету — обычно это 3–5 тыс. ₽.',
};

/** Тарифы: Про / Бригада (3, 5 или 10 человек) и 3D-проект для заказчика; оплата ЮKassa (карта, СБП) и Telegram Stars */
export default function Tariffs() {
  const { me } = useMe();
  const plans = useLoad(() => get<any[]>('/plans'), [me.promo?.code, me.access.mode, me.plan?.tier]);
  const [yearSel, setYear] = useState<boolean | null>(null);
  const [seats, setSeats] = useState(5);
  const cur: Tier = me.plan?.tier || 'free';
  const paid = me.access.mode === 'subscription';
  const perDay = (v: number, months: number) => Math.round(v / (months * 30.4));

  return (
    <>
      <h2 className="section-title">Тарифы</h2>
      {me.plan?.offer && <div className="dz-warn" style={{ borderColor: 'var(--ok)' }}>🎁 Для вас скидка {me.plan.offer.pct}% на месяц «Про» — до {new Date(me.plan.offer.until).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.</div>}
      <Load state={plans}>{(list) => {
        const proM = list.find((x) => x.code === 'pro_m');
        const firstDeal = proM?.price?.note === 'первый месяц';
        const year = yearSel ?? !firstDeal; // новичку сначала показываем первый месяц за 200 ₽, остальным — год
        return (
        <>
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={`chip ${!year ? 'on' : ''}`} onClick={() => setYear(false)}>{firstDeal ? `Первый месяц · ${rub(proM.price.rub)}` : 'На месяц'}</button>
            <button className={`chip ${year ? 'on' : ''}`} onClick={() => setYear(true)}>На год · выгоднее</button>
          </div>
          <div className="tariffs">
            {cur === 'lite' && paid && <div className="dz-warn">У вас тариф «Лайт» — он работает до {new Date(me.access.until).toLocaleDateString('ru-RU')}. Новых подписок «Лайт» больше нет: при переходе на «Про» оставшиеся дни пересчитаются.</div>}
            {(['pro', 'team'] as const).map((t) => {
              const p = list.find((x) => x.tier === t && x.months === (year ? 12 : 1) && (t !== 'team' || (x.seats || 3) === seats));
              if (!p) return null;
              const on = cur === t && paid;
              const price = p.price?.rub ?? p.rubPrice;
              return (
                <div key={t} className={`tariff ${t === 'pro' ? 'best' : ''} ${on ? 'on' : ''}`}>
                  <div className="row between">
                    <b className="tariff-name">{TIER_ICON[t]} {TIERS[t].label}</b>
                    {t === 'pro' && !on && <span className="badge ok">{p.price?.note || 'выбирают чаще'}</span>}
                    {on && <span className="badge ok">ваш тариф</span>}
                  </div>
                  <div className="tariff-price">
                    {price < p.rubPrice && <s className="muted" style={{ marginRight: 6 }}>{rub(year ? Math.round(p.rubPrice / 12) : p.rubPrice)}</s>}
                    <b className="num">{rub(year ? Math.round(price / 12) : price)}</b><span className="muted">{!year && p.price?.note === 'первый месяц' ? ` за первый месяц, дальше ${rub(p.rubPrice)}` : ` в месяц${year ? ` · ${rub(price)} за год` : ''}`}</span>
                  </div>
                  <div className="xs muted">≈ {perDay(price, p.months)} ₽ в день{t === 'pro' ? ' — дешевле пачки саморезов' : ''}{year ? ` · экономия ${rub(Math.round((list.find((x) => x.tier === t && x.months === 1 && (t !== 'team' || (x.seats || 3) === seats))?.rubPrice || 0) * 12 - p.rubPrice))}` : ''}</div>
                  {p.price?.discountPct > 0 && p.price?.note && p.price.note !== 'первый месяц' && <span className="badge ok">−{p.price.discountPct}% {p.price.note}</span>}
                  {t === 'team' && (
                    <div className="segc" role="radiogroup" aria-label="Человек в бригаде" style={{ margin: '6px 0 2px' }}>
                      {[3, 5, 10].map((n) => <button key={n} role="radio" aria-checked={seats === n} className={seats === n ? 'on' : ''} onClick={() => setSeats(n)}>до {n} чел.</button>)}
                    </div>
                  )}
                  {t === 'team' && <div className="xs muted">3 человека в базовой цене, каждый следующий — +{SEAT_RUB} ₽ в месяц</div>}
                  <ul className="tariff-perks">{TIERS[t].perks.map((x) => (t === 'team' && /^от 3 человек/.test(x) ? `до ${seats} человек, общий справочник цен` : x)).map((x) => <li key={x}>{!me.aiAvailable && /^ИИ/.test(x) ? <>{x.replace(/^ИИ-сметчик: /, 'ИИ-сметчик (').replace(/^ИИ: /, 'ИИ (')}) — <b className="soon">скоро, без доплаты</b></> : x}</li>)}</ul>
                  <PayButtons p={p} label={on ? 'Продлить' : undefined} />
                </div>
              );
            })}
          </div>
          {paid && <p className="xs muted">При смене тарифа или размера бригады оставшиеся дни пересчитываются по цене месяца.</p>}

          <h2 className="section-title">🧊 3D-проекты для заказчиков</h2>
          <p className="small muted" style={{ marginTop: 0 }}>3D-конструктор и смета по модели — бесплатно. Готовый проект для заказчика — отдельно: включите его в смету и заработайте на нём.</p>
          <div className="list">
            {['design1'].map((c) => list.find((x) => x.code === c)).filter(Boolean).map((p: any) => (
              <div key={p.code} className="list-item" style={{ display: 'block', cursor: 'default' }}>
                <div className="row between"><div className="title">{p.title} — за объект</div>{p.price?.note && <span className="badge ok">{p.price.note}</span>}</div>
                <div className="xs muted">{PACK_TEXT.design1}{me.plan?.extraDesigns ? ` Куплено и не использовано: ${me.plan.extraDesigns}.` : ''}</div>
                <PayButtons p={p} />
              </div>
            ))}
          </div>

          <p className="xs muted">Нужна всего одна смета без пометки? Оплатите её прямо в смете — {PRICES.estimate} ₽.</p>
        </>
        );
      }}</Load>
      <p className="xs muted">{me.pay?.yookassa ? 'Картой или через СБП — через ЮKassa. Или в Telegram Stars.' : 'Оплата в Telegram Stars; сумма в рублях примерная — зависит от того, где покупать звёзды.'} Доступ включается сразу после подтверждения платежа. Без автосписаний — продлеваете, только когда сами захотите.</p>
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
        <div>Вы в бригаде <b>«{d.owner}»</b>. {d.active ? 'Доступ уровня «Бригада» и общий справочник цен.' : d.reason === 'seats' ? 'Для вас нет оплаченного места: попросите бригадира выбрать тариф на больше человек.' : 'У бригадира закончилась подписка.'}</div>
        <button className="btn sm danger" disabled={busy} onClick={async () => { if (await confirmDialog('Выйти из бригады? Ваши сметы и справочник останутся у вас.')) act(async () => { await post('/team/leave'); await refreshMe(); }, 'Вы вышли из бригады'); }}>Выйти из бригады</button>
      </div>
    </>
  );

  return (
    <>
      <h2 className="section-title">Бригада · {1 + d.members.length} из {d.seats}</h2>
      <div className="panel stack">
        <p className="small muted" style={{ margin: 0 }}>Пригласите до {d.seats - 1} человек: у них будут все возможности тарифа и ваш справочник цен.</p>
        {1 + d.members.length > d.seats && <div className="dz-warn">В бригаде {1 + d.members.length} чел., а оплачено мест — {d.seats}. Участники без места работают без доступа к тарифу. Выберите тариф на больше человек или уберите лишних.</div>}
        {d.members.length > 0 && (
          <div className="list">
            {d.members.map((m: any) => (
              <div key={m.id} className="list-item">
                <div className="grow"><div className="title">👷 {m.name}</div>{d.role === 'owner' && m.active === false && <div className="xs" style={{ color: 'var(--bad)' }}>нет оплаченного места</div>}</div>
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
