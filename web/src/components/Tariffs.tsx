import React, { useState } from 'react';
import { get, post, del } from '../api';
import { useMe } from '../App';
import { Fold, Load, useLoad, useToast } from './ui';
import { openInvoice, haptic, tg, confirmDialog } from '../tg';
import { TIERS, SEAT_RUB, PRICES, type Tier } from '../../../shared/plans';
import { PayButtons, rub } from './Pay';

const TIER_ICON: Record<string, string> = { lite: '🔹', pro: '⭐', team: '👷' };
/** Что входит: строка → [Бесплатно, Лайт, Про]. Бригада и 3D — ниже, отдельно */
const COMPARE: [string, string, string, string][] = [
  ['Сметы', '3 в месяц', '✓', '✓'],
  ['Без пометки, ваш логотип', '—', '✓', '✓'],
  ['Договор, акты, КС-2, КС-3', '—', '—', '✓'],
  ['Объекты: деньги и долги', '—', '—', '✓'],
  ['3D-проект заказчику', `${PRICES.design} ₽`, `${PRICES.design} ₽`, '1 в мес.'],
];
/** Одна строка разницы на карточке вместо длинного списка */
const ONE_LINE: Record<string, string> = {
  lite: 'Сметы без пометки, с вашим логотипом',
  pro: 'Всё из «Лайт» + договор, акты, КС и учёт денег',
};
function Compare({ cur }: { cur: string }) {
  const cols = ['free', 'lite', 'pro'];
  return (
    <div className="panel" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
      <table className="compare" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr>
          <th style={{ textAlign: 'left', padding: '10px 8px' }}>Что входит</th>
          {['Бесплатно', 'Лайт', 'Про'].map((t, i) => <th key={t} style={{ padding: '10px 4px', textAlign: 'center', background: cols[i] === 'pro' ? 'var(--amber-soft, rgba(232,160,40,.12))' : undefined, whiteSpace: 'nowrap' }}>{t}{cur === cols[i] ? <div className="xs muted">ваш</div> : null}</th>)}
        </tr></thead>
        <tbody>{COMPARE.map(([name, ...v]) => (
          <tr key={name} style={{ borderTop: '1px solid var(--line)' }}>
            <td style={{ padding: '8px' }}>{name}</td>
            {v.map((x, i) => <td key={i} style={{ padding: '8px 4px', textAlign: 'center', color: x === '—' ? 'var(--muted)' : x === '✓' ? 'var(--ok)' : undefined, fontWeight: x === '✓' ? 700 : 400, background: cols[i] === 'pro' ? 'var(--amber-soft, rgba(232,160,40,.12))' : undefined }}>{x}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
const PACK_TEXT: Record<string, string> = {
  est10: `10 смет без пометки, с вашим логотипом. Действуют ${PRICES.packMonths} месяцев — удобно, если заказы бывают не каждый месяц.`,
  studio_m: 'Все 3D-проекты без ограничений на месяц.',
  design1: `PDF без водяного знака и 3D-ссылка для заказчика. Первый — ${PRICES.designFirst} ₽, дальше ${PRICES.design} ₽; в «Про» — 1 в месяц бесплатно.`,
};

/** Тарифы: Про / Бригада (3, 5 или 10 человек) и 3D-проект для заказчика; оплата ЮKassa (карта, СБП) и Telegram Stars */
export default function Tariffs() {
  const { me } = useMe();
  const plans = useLoad(() => get<any[]>('/plans'), [me.promo?.code, me.access.mode, me.plan?.tier]);
  const [yearSel, setYear] = useState<boolean | null>(null);
  const [seats, setSeats] = useState(5);
  const [showTeam, setShowTeam] = useState(() => me.plan?.tier === 'team');
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
        const liteM = list.find((x) => x.code === 'lite_m');
        const year = yearSel ?? !firstDeal; // новичку сначала показываем первый месяц со скидкой, остальным — год
        return (
        <>
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={`chip ${!year ? 'on' : ''}`} onClick={() => setYear(false)}>{firstDeal ? `Первый месяц · от ${rub(liteM?.price?.rub ?? proM.price.rub)}` : 'На месяц'}</button>
            <button className={`chip ${year ? 'on' : ''}`} onClick={() => setYear(true)}>На год · выгоднее</button>
          </div>
          <div className="tariffs">
            {me.access.mode === 'trial' && <div className="dz-warn" style={{ borderColor: 'var(--ok)' }}>🎁 Пробный период: открыто всё. Осталось {me.access.daysLeft} дн.</div>}
            <Compare cur={me.access.mode === 'trial' ? 'free' : cur} />
            {(['lite', 'pro', 'team'] as const).filter((t) => t !== 'team' || showTeam).map((t) => {
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
                  <div className="xs muted">≈ {perDay(price, p.months)} ₽ в день{year ? ` · экономия ${rub(Math.round((list.find((x) => x.tier === t && x.months === 1 && (t !== 'team' || (x.seats || 3) === seats))?.rubPrice || 0) * 12 - p.rubPrice))}` : ''}</div>
                  {p.price?.discountPct > 0 && p.price?.note && p.price.note !== 'первый месяц' && <span className="badge ok">−{p.price.discountPct}% {p.price.note}</span>}
                  {t === 'team' && (
                    <div className="segc" role="radiogroup" aria-label="Человек в бригаде" style={{ margin: '6px 0 2px' }}>
                      {[3, 5, 10].map((n) => <button key={n} role="radio" aria-checked={seats === n} className={seats === n ? 'on' : ''} onClick={() => setSeats(n)}>до {n} чел.</button>)}
                    </div>
                  )}
                  {t === 'team' && <div className="xs muted">3 человека в базовой цене, каждый следующий — +{SEAT_RUB} ₽ в месяц</div>}
                  {ONE_LINE[t] ? <div className="small" style={{ margin: '8px 0' }}>{ONE_LINE[t]}</div> : <ul className="tariff-perks">{TIERS[t].perks.map((x) => (t === 'team' && /^от 3 человек/.test(x) ? `до ${seats} человек, общий справочник цен` : x)).map((x) => <li key={x}>{!me.aiAvailable && /^ИИ/.test(x) ? <>{x.replace(/^ИИ-сметчик: /, 'ИИ-сметчик (').replace(/^ИИ: /, 'ИИ (')}) — <b className="soon">скоро, без доплаты</b></> : x}</li>)}</ul>}
                  <PayButtons p={p} label={on ? 'Продлить' : undefined} />
                </div>
              );
            })}
          </div>
          {paid && <p className="xs muted">При смене тарифа оставшиеся дни пересчитаются.</p>}

          {!showTeam && <Fold id="tariff-team" title="👷 Для бригады" summary={`от ${rub(list.find((x) => x.tier === 'team' && x.months === 1 && (x.seats || 3) === 3)?.rubPrice || 0)}`}>
            <p className="small" style={{ marginTop: 0 }}>Всё из «Про» для 3–10 человек и общий справочник цен.</p>
            <button className="btn block" onClick={() => setShowTeam(true)}>Показать тариф «Бригада»</button>
          </Fold>}
          <Fold id="tariff-3d" title="🧊 3D-проекты для заказчиков" summary={`от ${PRICES.designFirst} ₽`}>
          <p className="small muted" style={{ marginTop: 0 }}>Конструктор — бесплатно. Проект заказчику — отдельно.</p>
          <div className="list">
            {['design1', 'studio_m'].map((c) => list.find((x) => x.code === c)).filter(Boolean).map((p: any) => (
              <div key={p.code} className="list-item" style={{ display: 'block', cursor: 'default' }}>
                <div className="row between"><div className="title">{p.code === 'design1' ? `${p.title} — за объект` : p.title}</div>{p.price?.note && <span className="badge ok">{p.price.note}</span>}</div>
                <div className="xs muted">{PACK_TEXT[p.code]}{p.code === 'design1' && me.plan?.extraDesigns ? ` Куплено и не использовано: ${me.plan.extraDesigns}.` : ''}{p.code === 'studio_m' && me.plan?.studioUntil ? ` Активна до ${new Date(me.plan.studioUntil).toLocaleDateString('ru-RU')}.` : ''}</div>
                <PayButtons p={p} />
              </div>
            ))}
          </div>
          </Fold>

          <p className="xs muted">Нужна всего одна смета без пометки? Оплатите её прямо в смете — {PRICES.estimate} ₽.</p>
        </>
        );
      }}</Load>
      <p className="xs muted">{me.pay?.yookassa ? 'Карта, СБП или Telegram Stars.' : 'Оплата в Telegram Stars.'} Без автосписаний.</p>
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
