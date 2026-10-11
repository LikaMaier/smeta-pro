import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const KEY = 'smeta_onboarding_hidden';

/** Подсказка первого входа: три шага до первой сметы у заказчика */
export default function Onboarding({ onTemplate }: { onTemplate: () => void }) {
  const nav = useNavigate();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  if (hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* */ } };
  const steps = [
    { n: 1, title: 'Выберите шаблон', text: 'Газгольдер, септик, забор, площадка — или пустая смета', action: 'Выбрать', go: onTemplate },
    { n: 2, title: 'Поправьте объёмы и цены', text: 'Цены уже есть в справочнике — поменяйте их под себя', action: 'Справочник', go: () => nav('/catalog') },
    { n: 3, title: 'Отправьте PDF заказчику', text: 'Кнопка «PDF в Telegram» в смете — файл придёт вам в чат', action: null, go: null },
  ];
  return (
    <div className="panel" style={{ marginBottom: 8 }}>
      <div className="row between"><b style={{ color: 'var(--accent)', fontStyle: 'italic', fontSize: 18 }}>Первая смета за 5 минут</b>
        <button className="btn ghost sm" onClick={hide} aria-label="Скрыть подсказку">Скрыть</button></div>
      <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
        {steps.map((s) => (
          <li key={s.n} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line)', alignItems: 'flex-start' }}>
            <span style={{ flex: 'none', width: 28, height: 28, borderRadius: 14, background: 'var(--accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{s.n}</span>
            <div className="grow"><div style={{ fontWeight: 700 }}>{s.title}</div><div className="xs muted">{s.text}</div></div>
            {s.action && <button className="btn sm" onClick={s.go!}>{s.action}</button>}
          </li>
        ))}
      </ol>
    </div>
  );
}
