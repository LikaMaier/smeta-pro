import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useMe } from '../App';
import { useLoad } from '../components/ui';
import { rub0 } from '../format';
import { MASTERS } from '../../../shared/masters';
import Hero from '../components/Hero';
import Onboarding from '../components/Onboarding';

const monthNow = () => new Date().toISOString().slice(0, 7);
const MONTH_NAME = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' });

export default function Home() {
  const { me, refreshMe } = useMe();
  useEffect(() => { refreshMe().catch(() => {}); }, []); // eslint-disable-line
  const nav = useNavigate();
  const cal = useLoad(() => get<any>('/calendar', { month: monthNow() }), []);
  const fin = useLoad(() => get<any>('/finance/summary'), []);
  const rems = useLoad(() => get<any[]>('/reminders').catch(() => []), []);
  const remNext = (rems.data || []).filter((r: any) => r.active).sort((a: any, b: any) => +new Date(a.remindAt) - +new Date(b.remindAt));
  const remToday = remNext.filter((r: any) => new Date(r.remindAt).toDateString() === new Date().toDateString()).length;
  const [busy, setBusy] = useState(false);

  const createEstimate = async () => {
    setBusy(true);
    try { const e = await post('/estimates', { title: 'Новая смета' }); nav(`/estimates/${e.id}`); } catch { /* тост глобально */ } finally { setBusy(false); }
  };
  const earned = cal.data?.total?.earned;
  const active = fin.data?.activeCount;

  return (
    <>
      <Link to="/calendar" style={{ display: 'block' }}>
        <Hero
          title={<>Заработано за {MONTH_NAME(monthNow())}: <span className={earned < 0 ? 'neg' : ''}>{earned == null ? '…' : rub0(earned)}</span></>}
          sub={me.access.mode === 'subscription' ? `Подписка до ${new Date(me.access.until).toLocaleDateString('ru-RU')}` : me.access.mode === 'trial' ? `Пробный период: ${me.access.daysLeft} дн.` : me.access.mode === 'admin' ? 'Полный доступ' : me.access.freeEstimateLeft ? `Бесплатных смет осталось: ${me.access.freeLeft ?? 3} из 3` : me.access.mode === 'expired' ? 'Подписка закончилась' : 'Бесплатные сметы использованы — оформите подписку'}
        />
      </Link>

      {(me.access.estimateCount ?? 0) === 0 && <Onboarding onTemplate={() => nav('/estimates?new=1')} />}

      <div className="tiles">
        <button className="tile wide" onClick={() => (me.access.active || me.access.freeEstimateLeft ? createEstimate() : nav('/settings'))} disabled={busy}>
          + Новая смета{!me.access.active && me.access.freeEstimateLeft ? <small>бесплатно: осталось {me.access.freeLeft ?? 3} из 3</small> : null}
        </button>
        <Link className="tile" to="/estimates">Сметы</Link>
        <Link className="tile" to="/projects">Объекты{active ? <small>в работе: {active}</small> : <small>деньги и контакты</small>}</Link>
        <Link className="tile" to="/calendar">Календарь<small>фото, деньги, журнал</small></Link>
        <Link className="tile" to="/reminders">Напоминания<small>{remToday ? `сегодня: ${remToday}` : remNext.length ? `впереди: ${remNext.length}` : 'деньги, бетон, техника'}</small></Link>
        <Link className="tile" to="/catalog">Справочник цен<small>мои расценки</small></Link>
        <Link className="tile" to="/assistant">ИИ-сметчик<small>{me.aiEnabled ? 'включён' : 'выключен'}</small></Link>
        <Link className="tile slim wide" to="/designer">📐 Проектировщик 3D · навесы, беседки, гаражи, теплицы</Link>
        <Link className="tile slim wide" to="/calculators">🧮 Расчёты · {MASTERS.length + 1} мастеров и калькуляторы</Link>
        <Link className="tile slim wide" to="/settings">⚙️ Настройки · подписка, оформление, логотип</Link>
      </div>

    </>
  );
}
