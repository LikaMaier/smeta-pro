import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useMe } from '../App';
import { Icon, Load, Sheet, State, useLoad } from '../components/ui';
import { rub0 } from '../format';
import { CALCULATORS } from '../../../shared/calculators';

const monthNow = () => new Date().toISOString().slice(0, 7);
const MONTH_NAME = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'long' });

export default function Home() {
  const { me } = useMe();
  const nav = useNavigate();
  const cal = useLoad(() => get<any>('/calendar', { month: monthNow() }), []);
  const fin = useLoad(() => get<any>('/finance/summary'), []);
  const [pickProject, setPickProject] = useState(false);
  const projects = useLoad(() => (pickProject ? get<any[]>('/projects') : Promise.resolve([])), [pickProject]);
  const [busy, setBusy] = useState(false);

  const createEstimate = async () => {
    setBusy(true);
    try { const e = await post('/estimates', { title: 'Новая смета' }); nav(`/estimates/${e.id}`); } catch { /* тост глобально */ } finally { setBusy(false); }
  };
  const earned = cal.data?.total?.earned;
  const active = fin.data?.activeCount;

  return (
    <>
      <Link to="/calendar" className="box" style={{ display: 'block', marginBottom: 8 }}>
        Заработано за {MONTH_NAME(monthNow())}: <span className={earned < 0 ? 'neg' : ''}>{earned == null ? '…' : rub0(earned)}</span>
        <span className="line2 small" style={{ color: 'var(--muted)', fontWeight: 500 }}>
          {me.access.mode === 'trial' ? `Пробный период: ${me.access.daysLeft} дн.` : me.access.mode === 'subscription' ? 'Подписка активна' : 'Подписка закончилась'}
        </span>
      </Link>

      <div className="tiles">
        <button className="tile wide" onClick={createEstimate} disabled={busy || !me.access.active}>+ Новая смета</button>
        <Link className="tile" to="/calculators">Расчёты<small>калькуляторов: {CALCULATORS.length}</small></Link>
        <Link className="tile" to="/estimates">Сметы</Link>
        <Link className="tile" to="/projects">Объекты{active ? <small>в работе: {active}</small> : null}</Link>
        <Link className="tile" to="/calendar">Календарь<small>фото и заработок</small></Link>
        <Link className="tile" to="/finance">Финансы</Link>
        <Link className="tile" to="/catalog">Справочник цен</Link>
        <button className="tile" onClick={() => setPickProject(true)} disabled={!me.access.active}>Добавить расход</button>
        <Link className="tile" to="/notes">Заметки</Link>
        <Link className="tile" to="/assistant">ИИ-помощник<small>{me.aiEnabled ? 'включён' : 'выключен'}</small></Link>
        <Link className="tile" to="/settings">Настройки</Link>
      </div>

      <Sheet open={pickProject} onClose={() => setPickProject(false)} title="К какому объекту расход?">
        <Load state={projects} empty={(d) => (d.length ? null : <State title="Нет объектов" text="Сначала создайте объект." action={<button className="btn primary" onClick={() => nav('/projects?new=1')}>Создать объект</button>} />)}>
          {(list) => (
            <div className="list">
              {list.map((p) => <button key={p.id} className="list-item" onClick={() => nav(`/projects/${p.id}?add=expense`)}><div className="grow title">{p.name}</div><Icon.chevron className="chev" width={18} /></button>)}
            </div>
          )}
        </Load>
      </Sheet>
    </>
  );
}
