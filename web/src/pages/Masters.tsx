import React from 'react';
import { Link } from 'react-router-dom';
import { MASTERS } from '../../../shared/masters';

/** Раздел «Мастера»: расчёт под ключ по специальности → готовая смета с работами и материалами */
const LIST = [
  { id: 'fence-pro', icon: '🚧', trade: 'Заборы и ворота', description: '17 видов заборов × 6 способов монтажа, ворота, калитки, автоматика' },
  ...MASTERS.map((m) => ({ id: m.id, icon: m.icon, trade: m.trade, description: m.description })),
];

export default function Masters() {
  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>Выберите мастера, укажите размеры и варианты — получите полный список работ и материалов с ценами и добавьте его в смету одной кнопкой.</p>
      <Link to="/designer" className="panel row" style={{ padding: 12, marginBottom: 10, color: 'inherit' }}>
        <span style={{ fontSize: 30, width: 40, textAlign: 'center' }} aria-hidden="true">📐</span>
        <div className="grow"><b>ИИ-проектировщик</b><div className="xs muted">Навес, площадка ТКО: 3D, чертежи с размерами, раскрой металла и смета</div></div>
      </Link>
      <div className="list">
        {LIST.map((m) => (
          <Link key={m.id} to={`/calculators/${m.id}`} className="list-item">
            <span style={{ fontSize: 30, width: 40, textAlign: 'center', flex: 'none' }} aria-hidden="true">{m.icon}</span>
            <div className="grow"><div className="title">{m.trade}</div><div className="xs muted">{m.description}</div></div>
          </Link>
        ))}
      </div>
      <p className="xs muted">Работы и цены берутся из вашего справочника (или примерные), материалы — с примерными ценами: проверьте их у поставщика. Сложность объекта добавляет надбавку к работам.</p>
    </>
  );
}
