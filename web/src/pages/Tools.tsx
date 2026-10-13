import React from 'react';
import { Link } from 'react-router-dom';
import { MASTERS } from '../../../shared/masters';
import { useMe } from '../App';

/** «3D и расчёты»: все проектировщики и калькуляторы в одном месте, по группам */
const GROUPS: { title: string; hint: string; items: { to: string; icon: string; title: string; text: string }[] }[] = [
  {
    title: '3D-проекты', hint: 'Модель, чертежи, PDF и готовая смета',
    items: [
      { to: '/designer', icon: '🏠', title: 'Постройки', text: 'Навесы, беседки, гаражи, хозблоки, бытовки, теплицы' },
      { to: '/fence', icon: '🚧', title: 'Заборы и ворота', text: 'Профлист, евроштакетник, 3D-сетка, кирпичные столбы' },
      { to: '/mep', icon: '⚡', title: 'Электрика и сантехника', text: 'Розетки, свет, щит по ПУЭ, трубы и канализация' },
      { to: '/site', icon: '🗺', title: 'План участка', text: 'Дом, септик, газгольдер, скважина — с проверкой норм' },
    ],
  },
  {
    title: 'Расчёты', hint: 'Без чертежей — сразу работы и материалы',
    items: [
      { to: '/masters', icon: '👷', title: 'Мастера под ключ', text: `${MASTERS.length} видов работ: плитка, кровля, фундамент, отделка…` },
      { to: '/calculators', icon: '🧮', title: 'Быстрые калькуляторы', text: 'Бетон, кирпич, ГКЛ, краска, утеплитель, площади' },
    ],
  },
];

export default function Tools() {
  const { me } = useMe();
  return (
    <>
      <h1 className="page-title">3D и расчёты</h1>
      {GROUPS.map((g) => (
        <section key={g.title} style={{ marginBottom: 14 }}>
          <div className="home-sec"><span>{g.title}</span><span className="xs muted">{g.hint}</span></div>
          <div className="list">
            {g.items.map((i) => (
              <Link key={i.to} to={i.to} className="list-item">
                <span style={{ fontSize: 26, width: 34, textAlign: 'center', flex: 'none' }} aria-hidden="true">{i.icon}</span>
                <div className="grow"><div className="title">{i.title}</div><div className="xs muted">{i.text}</div></div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <Link to="/assistant" className="list-item panel">
        <span style={{ fontSize: 26, width: 34, textAlign: 'center', flex: 'none' }} aria-hidden="true">🤖</span>
        <div className="grow"><div className="title">ИИ-сметчик</div><div className="xs muted">{!me.aiAvailable ? 'Скоро: смета по голосу и по фото' : 'Смета по голосу и тексту'}</div></div>
      </Link>
    </>
  );
}
