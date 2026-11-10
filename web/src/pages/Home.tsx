import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../api';
import { useMe } from '../App';
import { useLoad } from '../components/ui';
import { rub0 } from '../format';
import Hero from '../components/Hero';
import IgBonus from '../components/IgBonus';
import FirstEstimate, { GuideVideo } from './FirstEstimate';

const monthNow = () => new Date().toISOString().slice(0, 7);
const MONTH_NAME = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' });

/**
 * Главная. Первый вход (смет ещё не было) или кнопка из бота (?t=, ?job=) — «Первая смета за 3 шага»:
 * один путь к первой смете без меню и разделов. Остальное приложение откроется после неё (или по «Пропустить»).
 */
export default function Home() {
  const { me } = useMe();
  const [firstRun, setFirstRun] = useState(() => (me.estimatesTotal ?? 1) === 0 || /[?&](t|job)=/.test(location.search));
  return firstRun ? <FirstEstimate onSkip={() => setFirstRun(false)} /> : <HomeMain />;
}

/**
 * Главная — три вещи: «Расчёт объекта» (большая кнопка) · «Сметы» · «Расценки».
 *  Ниже — последняя смета и одна строка «Ещё» (объекты, календарь, финансы, 3D, настройки).
 */
function HomeMain() {
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
        Расчёт объекта
        <small>{!me.access.active && me.access.freeEstimateLeft && (me.access.freeLeft ?? 0) <= 1000 ? `выберите работу, введите размер — смета готова · бесплатно ещё ${me.access.freeLeft ?? 3}` : 'выберите работу, введите размер — смета готова'}</small>
      </button>


      <div className="tiles" style={{ marginTop: 3 }}>
        <Link className="tile" to="/estimates">📋 Сметы<small>{(recent.data || []).length ? 'открыть, поправить, отправить' : 'здесь будут ваши сметы'}</small></Link>
        <Link className="tile" to="/catalog">💰 Расценки<small>ваши цены на работы</small></Link>
      </div>

      <IgBonus />

      {last.length > 0 && (
        <>
          <div className="row between home-sec"><span>Последняя смета</span></div>
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

      <div className="list" style={{ marginTop: 12 }}>
        <Link to="/more" className="list-item">
          <span style={{ fontSize: 20, width: 26, textAlign: 'center', flex: 'none' }} aria-hidden="true">☰</span>
          <div className="grow"><div className="title">Ещё</div><div className="xs muted">{remToday ? `напоминаний сегодня: ${remToday} · ` : ''}объекты{active ? ` (в работе: ${active})` : ''}, календарь, 3D, настройки</div></div>
        </Link>
      </div>
      <GuideVideo label="▶️ Как пользоваться — видео, 1 минута" />
    </>
  );
}
