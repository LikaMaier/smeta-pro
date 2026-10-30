import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../api';
import { useMe } from '../App';
import { useLoad } from '../components/ui';
import { rub0 } from '../format';
import Hero from '../components/Hero';
import IgBonus from '../components/IgBonus';

const monthNow = () => new Date().toISOString().slice(0, 7);
const MONTH_NAME = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' });

/**
 * Главная — одно главное действие и четыре раздела:
 *  «Новая смета» (большая кнопка) → последние сметы → Объекты · Календарь · 3D и расчёты · Справочник и ещё.
 * Всё остальное — внутри разделов, чтобы новичок не терялся.
 */
export default function Home() {
  const { me, refreshMe } = useMe();
  useEffect(() => { refreshMe().catch(() => {}); }, []); // eslint-disable-line
  const nav = useNavigate();
  const cal = useLoad(() => get<any>('/calendar', { month: monthNow() }), []);
  const fin = useLoad(() => get<any>('/finance/summary'), []);
  const recent = useLoad(() => get<any[]>('/estimates').catch(() => []), []);
  const rems = useLoad(() => get<any[]>('/reminders').catch(() => []), []);
  const remToday = (rems.data || []).filter((r: any) => r.active && new Date(r.remindAt).toDateString() === new Date().toDateString()).length;
  const earned = cal.data?.total?.earned;
  const active = fin.data?.activeCount;
  const canCreate = me.access.active || me.access.freeEstimateLeft;
  const last = (recent.data || []).filter((e: any) => !e.isTemplate).slice(0, 1);

  return (
    <>
      {me.isAdmin && <Link to="/admin/stats" className="list-item panel" style={{ marginBottom: 10 }}><span style={{ fontSize: 22, width: 30, textAlign: 'center', flex: 'none' }} aria-hidden="true">📊</span><div className="grow"><div className="title">Статистика приложения</div><div className="xs muted">заходы, сметы, оплаты — видите только вы</div></div></Link>}
      {(me.access.estimateCount ?? 0) > 0 && <Link to="/calendar" style={{ display: 'block' }}>
        <Hero
          title={<>Заработано за {MONTH_NAME(monthNow())}: <span className={earned < 0 ? 'neg' : ''}>{earned == null ? '…' : rub0(earned)}</span></>}
          sub={me.access.mode === 'subscription' || me.access.mode === 'team' ? `Тариф «${me.plan?.label || 'Про'}» до ${new Date(me.access.until).toLocaleDateString('ru-RU')}` : me.access.mode === 'trial' ? `Пробный период — всё открыто: ${me.access.daysLeft} дн.` : me.access.mode === 'admin' ? 'Полный доступ' : me.access.freeEstimateLeft ? ((me.access.freeLeft ?? 0) > 1000 ? 'Сметы — бесплатно, без ограничений' : `Бесплатных смет в этом месяце: ${me.access.freeLeft ?? 3}`) : me.access.mode === 'expired' ? 'Подписка закончилась' : 'Бесплатные сметы месяца использованы — новые 1-го числа'}
        />
      </Link>}

      <button className="tile wide home-new" onClick={() => nav(canCreate ? '/new' : '/settings')}>
        <span className="home-new-plus" aria-hidden="true">+</span>
        Новая смета
        <small>{!me.access.active && me.access.freeEstimateLeft ? ((me.access.freeLeft ?? 0) > 1000 ? 'сметы бесплатно — без ограничений' : `бесплатно в этом месяце: ещё ${me.access.freeLeft ?? 3}`) : 'выберите направление — смета соберётся сама'}</small>
      </button>


      <IgBonus />

      {last.length > 0 && (
        <>
          <div className="row between home-sec"><span>Продолжить</span><Link to="/estimates" className="xs">Все сметы →</Link></div>
          <div className="list">
            {last.map((e: any) => (
              <Link key={e.id} to={`/estimates/${e.id}`} className="list-item">
                <div className="grow"><div className="title ellipsis">{e.title}</div><div className="xs muted ellipsis">{[e.customer, e.project?.name].filter(Boolean).join(' · ') || `${e.linesCount} поз.`}</div></div>
                <b className="num">{rub0(e.total)}</b>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="tiles" style={{ marginTop: 10 }}>
        <Link className="tile" to="/projects">🏗 Объекты<small>{active ? `в работе: ${active}` : 'деньги, долги, контакты'}</small></Link>
        <Link className="tile" to="/calendar">📅 Календарь<small>{remToday ? `напоминаний сегодня: ${remToday}` : 'фото, журнал, напоминания'}</small></Link>
        <Link className="tile" to="/tools">📐 3D и расчёты<small>постройки, заборы, электрика, мастера</small></Link>
        <Link className="tile" to="/more">📚 Справочник и ещё<small>цены, финансы, контакты, настройки</small></Link>
      </div>
    </>
  );
}
