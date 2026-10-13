import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

const ITEMS = [
  { to: '/catalog', icon: Icon.book, title: 'Справочник цен', text: 'Мои расценки на работы и материалы' },
  { to: '/finance', icon: Icon.money, title: 'Финансы', text: 'Прибыль и долги по всем объектам' },
  { to: '/contacts', icon: Icon.book, title: 'Записная книжка', text: 'Все телефоны: заказчики, техника, рабочие' },
  { to: '/reminders', icon: Icon.history, title: 'Напоминания', text: 'Бот напишет в нужное время' },
  { to: '/tools', icon: Icon.calc, title: '3D и расчёты', text: 'Постройки, заборы, электрика, мастера, калькуляторы' },
  { to: '/settings', icon: Icon.gear, title: 'Настройки и подписка', text: 'Тариф, оформление, логотип, реквизиты' },
];

export default function More() {
  return (
    <>
      <h1 className="page-title">Справочник и ещё</h1>
      <div className="list">
        {ITEMS.map((i) => (
          <Link key={i.to} to={i.to} className="list-item">
            <i.icon width={24} style={{ color: 'var(--accent)', flex: 'none' }} />
            <div className="grow"><div className="title">{i.title}</div><div className="xs muted">{i.text}</div></div>
            <Icon.chevron className="chev" width={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
