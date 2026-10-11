import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MASTERS } from '../../../shared/masters';
import { CALCULATORS, CALC_GROUPS } from '../../../shared/calculators';
import { SearchBox } from '../components/ui';

/**
 * Единый раздел «Расчёты»: 3D-проектировщик → мастера под ключ (смета с работами) → быстрые калькуляторы (сколько материала).
 * Калькуляторы, которые повторяют мастера, спрятаны из списка (ссылки на них продолжают работать).
 */
const LIST = [
  { id: 'fence-pro', icon: '🚧', trade: 'Заборы и ворота', description: '17 видов заборов × 6 способов монтажа, ворота, калитки, автоматика' },
  ...MASTERS.map((m) => ({ id: m.id, icon: m.icon, trade: m.trade, description: m.description })),
];
// калькулятор → мастер, который считает то же самое полнее
export const COVERED_BY_MASTER: Record<string, string> = {
  tile: 'm-tile', grout: 'm-tile', fence: 'fence-pro', paving: 'm-paving', septic: 'm-septic', well: 'm-well', electric: 'm-electric',
  'gkl-wall': 'm-gkl', 'gkl-ceiling': 'm-gkl', brick: 'm-mason', 'roof-gable': 'm-roof', 'strip-foundation': 'm-found', plaster: 'm-finish', screed: 'm-floor',
};

export default function Masters() {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const masters = LIST.filter((m) => !s || `${m.trade} ${m.description}`.toLowerCase().includes(s));
  const calcs = useMemo(() => CALCULATORS.filter((c) => c.group !== 'Мастера' && !COVERED_BY_MASTER[c.id] && (!s || `${c.title} ${c.short || ''} ${c.group}`.toLowerCase().includes(s))), [s]);
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Найти: плитка, бетон, забор, септик…" />
      {!s && (
        <Link to="/designer" className="panel row" style={{ padding: 12, margin: '10px 0', color: 'inherit' }}>
          <span style={{ fontSize: 30, width: 40, textAlign: 'center' }} aria-hidden="true">📐</span>
          <div className="grow"><b>Проектировщик 3D</b><div className="xs muted">Навесы, ТКО, беседки, гаражи, теплицы: 3D, чертежи, металл и смета</div></div>
        </Link>
      )}
      {masters.length > 0 && <div className="tile-group">Мастера под ключ — смета с работами и материалами</div>}
      <div className="list">
        {masters.map((m) => (
          <Link key={m.id} to={`/calculators/${m.id}`} className="list-item">
            <span style={{ fontSize: 30, width: 40, textAlign: 'center', flex: 'none' }} aria-hidden="true">{m.icon}</span>
            <div className="grow"><div className="title">{m.trade}</div><div className="xs muted">{m.description}</div></div>
          </Link>
        ))}
      </div>
      {calcs.length > 0 && <div className="tile-group">Быстрые калькуляторы — сколько материала</div>}
      {CALC_GROUPS.filter((g) => g !== 'Мастера').map((g) => {
        const cs = calcs.filter((c) => c.group === g);
        if (!cs.length) return null;
        return (
          <section key={g}>
            <div className="xs muted" style={{ margin: '10px 2px 4px' }}>{g}</div>
            <div className="tiles">{cs.map((c) => <Link key={c.id} to={`/calculators/${c.id}`} className="tile" style={{ minHeight: 72 }}>{c.short || c.title}</Link>)}</div>
          </section>
        );
      })}
      {!masters.length && !calcs.length && <p className="muted">Ничего не нашлось — попробуйте другое слово.</p>}
      <p className="xs muted">Мастер считает объект целиком: работы из вашего справочника, материалы с ценами — и добавляет в смету. Калькулятор быстро отвечает «сколько нужно материала». Плитка, забор, кровля, фундамент и др. — в мастерах.</p>
    </>
  );
}
