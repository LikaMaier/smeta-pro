import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { get } from '../api';
import { useMe } from '../App';
import { Chips, Load, useLoad } from '../components/ui';
import { rub0 } from '../format';

type Range = '0' | '7' | '30' | '90';
const RANGES: { value: Range; label: string }[] = [{ value: '0', label: 'Сегодня' }, { value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '90', label: '90 дней' }];
const SERIES = [
  { key: 'users', label: 'Новые' }, { key: 'visitors', label: 'Заходы' },
  { key: 'estimates', label: 'Сметы' }, { key: 'payments', label: 'Оплаты' },
] as const;
const dm = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const dmt = (s: string) => new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');

/** Статистика приложения — только для владельца */
export default function AdminStats() {
  const { me } = useMe();
  const [range, setRange] = useState<Range>('0');
  const [metric, setMetric] = useState<(typeof SERIES)[number]['key']>('users');
  const st = useLoad(() => get<any>('/admin/stats', { days: range }), [range]);
  if (!me.isAdmin) return <Navigate to="/" replace />;
  return (
    <>
      <Chips<Range> value={range} options={RANGES} onChange={setRange} />
      <Load state={st}>{(d) => {
        const p = d.period, f = d.funnel;
        const max = Math.max(1, ...d.series.map((x: any) => x[metric]));
        return (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="kpi">
              <div><b>{p.newUsers}</b><span>новых</span></div>
              <div><b>{p.visitors}</b><span>заходили</span></div>
              <div><b>{p.opens}</b><span>открытий</span></div>
              <div><b>{p.estimates}</b><span>смет{p.estimators ? ` · ${p.estimators} чел.` : ''}</span></div>
              <div><b>{p.designs}</b><span>3D-проектов</span></div>
              <div><b>{p.checkouts}</b><span>начали оплату</span></div>
              <div><b>{p.payments}</b><span>оплат</span></div>
              <div><b>{rub0(p.rub)}</b><span>выручка{p.stars ? ` + ${p.stars} ⭐` : ''}</span></div>
              <div><b>{d.totals.paid}</b><span>платных сейчас</span></div>
            </div>

            <div className="panel">
              <div className="row between" style={{ marginBottom: 8 }}><b>По дням</b><span className="xs muted">{d.series.length} дн.</span></div>
              <Chips value={metric} options={SERIES.map((s) => ({ value: s.key, label: s.label }))} onChange={setMetric as any} />
              <div className="sbars" role="img" aria-label={`График: ${SERIES.find((s) => s.key === metric)!.label} по дням`}>
                {d.series.map((x: any) => (
                  <div key={x.day} className="sbar" title={`${dm(x.day)}: ${x[metric]}`}>
                    <i>{x[metric] || ''}</i>
                    <span style={{ height: `${(x[metric] / max) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="row between xs muted"><span>{dm(d.series[0].day)}</span><span>сегодня</span></div>
            </div>

            <div className="panel">
              <b>Воронка новых за период</b>
              {[['Зарегистрировались', f.registered], ['Сделали смету', f.estimated], ['Начали оплату', f.checkout], ['Оплатили', f.paid]].map(([l, v], i) => (
                <div key={l as string} style={{ marginTop: 8 }}>
                  <div className="row between small"><span>{l}</span><span><b>{v as number}</b>{i ? <span className="muted"> · {pct(v as number, f.registered)}</span> : null}</span></div>
                  <div className="meter"><span style={{ width: f.registered ? `${((v as number) / f.registered) * 100}%` : 0 }} /></div>
                </div>
              ))}
            </div>

            <div className="panel">
              <b>Всего</b>
              <div className="small" style={{ marginTop: 6 }}>Пользователей: <b>{d.totals.users}</b> · платных: <b>{d.totals.paid}</b> · на пробном: <b>{d.totals.trial}</b></div>
              {Object.keys(d.totals.tiers).length > 0 && <div className="xs muted">По тарифам: {Object.entries(d.totals.tiers).map(([k, v]) => `${({ pro: 'Про', team: 'Бригада', lite: 'Лайт' } as any)[k] || k} — ${v}`).join(', ')}</div>}
            </div>

            <h2 className="section-title">Оплаты за период</h2>
            {d.payments.length ? <div className="list">{d.payments.map((x: any, i: number) => (
              <div key={i} className="list-item"><div className="grow"><div className="title">{x.name || 'без имени'}{x.username ? ` @${x.username}` : ''}</div><div className="xs muted">{x.plan} · {dmt(x.at)}</div></div><b>{x.rub ? rub0(x.rub) : `${x.stars} ⭐`}</b></div>
            ))}</div> : <p className="muted small">Оплат пока нет.</p>}

            <h2 className="section-title">Последние пользователи</h2>
            <div className="list">{d.users.map((u: any, i: number) => (
              <div key={i} className="list-item"><div className="grow">
                <div className="title">{u.name || 'без имени'}{u.username ? ` @${u.username}` : ''}</div>
                <div className="xs muted">с {dm(u.at)} · смет: {u.estimates} · {u.lastSeen ? `заходил ${dm(u.lastSeen)}` : 'заходов не отмечено'}{u.source ? ` · ${u.source}` : ''}</div>
              </div><span className={`badge ${u.status.startsWith('платный') ? 'ok' : ''}`}>{u.status}</span></div>
            ))}</div>
            <p className="xs muted">Свои действия и действия админов не учитываются. Заходы считаются с 13 октября 2026. Та же сводка приходит в бот в 9, 14 и 20 часов, а по команде /stats — в любой момент.</p>
          </div>
        );
      }}</Load>
    </>
  );
}
