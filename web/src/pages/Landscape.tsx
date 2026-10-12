import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

/** Благоустройство участка: план с нормами, заборы в 3D и мастера по наружным работам */
const MAIN = [
  { to: '/site', ic: '🗺', title: 'План участка', text: 'Дом, септик, газгольдер, скважина, парковка — перетаскиваете пальцем, расстояния по нормам проверяются сразу. 3D, генплан, схема сетей и смета.' },
  { to: '/fence', ic: '🚧', title: 'Заборы и ворота 3D', text: 'Профлист, евроштакетник, 3D-сетка, ранчо, кирпичные столбы. Откатные и распашные ворота, калитка, фасад и узлы, металл и смета.' },
];
const MASTERS = [
  { to: '/calculators/m-septic', ic: '♻️', title: 'Канализация и септики', text: 'Станция, пластиковый септик, кольца, дренажное поле' },
  { to: '/calculators/m-well', ic: '💧', title: 'Скважина или колодец', text: 'Бурение, кессон, насос, вода в дом' },
  { to: '/calculators/m-paving', ic: '🛣', title: 'Мощение и площадки', text: 'Плитка, брусчатка, гранит, асфальт, щебень' },
  { to: '/calculators/fence-pro', ic: '🧮', title: 'Забор: быстрый расчёт', text: 'Все виды заборов без 3D — сразу строки сметы' },
  { to: '/designer', ic: '⛱', title: 'Навесы, беседки, гаражи', text: 'Проектировщик 3D строений на участке' },
];

export default function Landscape() {
  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>Всё для участка: расстановка с проверкой норм, заборы в 3D и расчёт наружных работ. Проект можно показать заказчику ссылкой с 3D и отправить в PDF.</p>
      <div className="stack">
        {MAIN.map((m) => (
          <Link key={m.to} to={m.to} className="panel land-card">
            <span className="ic" aria-hidden="true">{m.ic}</span>
            <div className="grow"><div className="title" style={{ fontWeight: 700, fontSize: 18 }}>{m.title}</div><div className="xs muted">{m.text}</div></div>
            <Icon.chevron className="chev" width={18} />
          </Link>
        ))}
      </div>
      <h2 className="section-title">Мастера наружных работ</h2>
      <div className="list">
        {MASTERS.map((m) => (
          <Link key={m.to} to={m.to} className="list-item">
            <span style={{ fontSize: 22, width: 30, textAlign: 'center' }} aria-hidden="true">{m.ic}</span>
            <div className="grow"><div className="title">{m.title}</div><div className="xs muted">{m.text}</div></div>
            <Icon.chevron className="chev" width={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
