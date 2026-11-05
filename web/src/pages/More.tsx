import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';
import { useMe } from '../App';
import { tg } from '../tg';

const ITEMS = [
  { to: '/calendar', icon: '📅', title: 'Календарь', text: 'Что сделано за день, фото, деньги' },
  { to: '/reminders', icon: '⏰', title: 'Напоминания', text: 'Бот напишет в нужное время' },
  { to: '/finance', icon: '💵', title: 'Финансы', text: 'Прибыль и долги по всем объектам' },
  { to: '/contacts', icon: '📒', title: 'Записная книжка', text: 'Телефоны заказчиков, техники, рабочих' },
  { to: '/tools', icon: '📐', title: '3D и расчёты', text: 'Постройки, заборы, электрика, калькуляторы' },
  { to: '/settings', icon: '⚙️', title: 'Настройки и подписка', text: 'Тариф, логотип, реквизиты' },
];

export default function More() {
  const { me } = useMe();
  const support = () => {
    const u = me.supportLink || 'https://t.me/CMETA_Pro_bot?start=help';
    if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
  };
  return (
    <>
      <h1 className="page-title">Ещё</h1>
      <div className="list">
        {ITEMS.map((i) => (
          <Link key={i.to} to={i.to} className="list-item">
            <span style={{ fontSize: 22, width: 24, textAlign: 'center', flex: 'none' }} aria-hidden="true">{i.icon}</span>
            <div className="grow"><div className="title">{i.title}</div><div className="xs muted">{i.text}</div></div>
            <Icon.chevron className="chev" width={18} />
          </Link>
        ))}
        <button className="list-item" onClick={() => { const u = (me.supportLink || 'https://t.me/CMETA_Pro_bot?start=help').replace(/start=help$/, 'start=guide'); if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank'); }} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ fontSize: 22, width: 24, textAlign: 'center', flex: 'none' }} aria-hidden="true">📖</span>
          <div className="grow"><div className="title">Видеоинструкция</div><div className="xs muted">Как сделать смету — 1 минута, придёт в чат с ботом</div></div>
          <Icon.chevron className="chev" width={18} />
        </button>
        <button className="list-item" onClick={support} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ fontSize: 22, width: 24, textAlign: 'center', flex: 'none' }} aria-hidden="true">💬</span>
          <div className="grow"><div className="title">Поддержка</div><div className="xs muted">Вопрос, ошибка или идея — ответим в Telegram</div></div>
          <Icon.chevron className="chev" width={18} />
        </button>
      </div>
    </>
  );
}
