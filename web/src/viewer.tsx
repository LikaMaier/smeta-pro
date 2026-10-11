import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildCanopy } from '../../shared/design/canopy';
import { paramRows } from '../../shared/design/report';
import { Viewer, Drawings } from './components/Design3D';
import './viewer.css';

/** Страница 3D-проекта для заказчика: без входа в Telegram, только просмотр */
const D: any = (window as any).__DESIGN__ || null;
const nf = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v);

const VARS: { id: string; label: string; changes: string[]; total: number; params: any }[] = Array.isArray(D?.params?._variants) ? D.params._variants : [];
const money = (v: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(v))} ₽`;

function Page() {
  const [vid, setVid] = useState(VARS.length ? 'std' : '');
  const cur = VARS.find((v) => v.id === vid);
  const res = useMemo(() => (D ? buildCanopy(cur ? cur.params : D.params) : null), [vid]);
  const [showDraw, setShowDraw] = useState(false);
  if (!D || !res) return <div className="card"><h1>Проект недоступен</h1><p className="muted">Попросите исполнителя прислать ссылку заново.</p></div>;
  const tiles = res.summary.filter((s) => !/стоимост/i.test(s.label)).slice(0, 6);
  return (
    <>
      {(D.company || D.logo) && (
        <div className="card head">
          {D.logo && <img className="logo" src={D.logo} alt="" />}
          <div><div className="company">{D.company}</div>{D.contacts && <div className="muted small pre">{D.contacts}</div>}</div>
        </div>
      )}
      <div className="card">
        <div className="muted small">{D.kind} · эскизный проект от {new Date(D.date).toLocaleDateString('ru-RU')}</div>
        <h1>{D.title}</h1>
        {VARS.length > 0 && (
          <div className="vars">
            {VARS.map((v) => (
              <button key={v.id} className={`var ${v.id === vid ? 'on' : ''}`} onClick={() => setVid(v.id)}>
                <span>{v.label}</span><b>≈ {money(v.total)}</b>
              </button>
            ))}
          </div>
        )}
        <Viewer res={res} />
        {cur && <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{cur.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
        <div className="tiles">{tiles.map((s) => <div key={s.label}><small>{s.label}</small><b>{nf(s.value)} <small>{s.unit}</small></b></div>)}</div>
      </div>
      {D.estimateUrl && <a className="btn main" href={D.estimateUrl}>Смета, стоимость и согласование</a>}
      {D.username && <a className="btn" href={`https://t.me/${D.username}`}>Написать исполнителю в Telegram</a>}
      <div className="card" style={{ marginTop: 12 }}>
        <h2>Параметры</h2>
        <table className="kv"><tbody>{paramRows(res).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <h2>Чертежи</h2>
        {showDraw ? <Drawings res={res} note={false} /> : <button className="btn" style={{ marginTop: 0 }} onClick={() => setShowDraw(true)}>Показать план, фасады и разрез</button>}
      </div>
      <p className="muted xs" style={{ padding: '0 4px' }}>Эскизный проект: внешний вид, размеры и материалы. Не является расчётом конструкций.{VARS.length ? ' Цены вариантов ориентировочные — точная стоимость в смете исполнителя.' : ''}</p>
      <div className="foot">Сделано в <a href={D.botUrl}>СМЕТА PRO</a> — сметы и проекты для строителей</div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
