import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from '../api';
import { Load, useLoad, useToast } from '../components/ui';
import { haptic, tg } from '../tg';
import { JOB_GROUPS, getJob } from '../../../shared/firstJobs';
import { calcShareText } from '../../../shared/leadCalc';

const plural = (k: number, one: string, few: string, many: string) => {
  const a = k % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};

/**
 * «Калькулятор для заказчиков»: личная ссылка мастера. Заказчик сам считает работу по ценам мастера
 * и оставляет телефон — мастеру приходит заявка, в приложении появляется готовая смета.
 */
export default function MyCalc() {
  const toast = useToast();
  const st = useLoad(() => get<any>('/mycalc'), []);
  const [busy, setBusy] = useState(false);

  return (
    <Load state={st}>{(d: any) => {
      const open = () => { const u = `${d.url}?me=1`; if (tg?.openLink) tg.openLink(u); else window.open(u, '_blank'); };
      const share = () => {
        const u = `https://t.me/share/url?url=${encodeURIComponent(d.url)}&text=${encodeURIComponent(calcShareText(''))}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
      };
      const copy = async () => {
        try { await navigator.clipboard.writeText(`${calcShareText('')}\n${d.url}`); haptic('success'); toast('Скопировано — вставьте в объявление, статус или сообщение'); }
        catch { toast('Не получилось скопировать — выделите ссылку вручную', true); }
      };
      const toggle = async (id: string) => {
        const next: string[] = d.jobs.includes(id) ? d.jobs.filter((x: string) => x !== id) : [...d.jobs, id];
        if (!next.length) { toast('Оставьте хотя бы одну работу', true); return; }
        setBusy(true);
        try { st.setData(await patch('/mycalc', { jobs: next })); haptic('light'); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
      };
      return (
        <>
          <div className="mc-hero">
            <div className="mc-fire" aria-hidden="true">🔥</div>
            <h2>Калькулятор для ваших заказчиков</h2>
            <p>Заказчик сам выбирает работу и размер, видит цену по <b>вашим</b> ценам и оставляет телефон. Вам приходит заявка в Telegram, а в приложении — уже готовая смета.</p>
            <div className="mc-stats">
              <div><b className="num">{d.views}</b><span>открыли</span></div>
              <div><b className="num">{d.leads}</b><span>{plural(d.leads, 'заявка', 'заявки', 'заявок')}</span></div>
            </div>
          </div>

          <div className="panel mc-link">
            <div className="xs muted">Ваша ссылка</div>
            <input className="input" readOnly value={d.url} onFocus={(e) => e.target.select()} aria-label="Ссылка на калькулятор" />
            <button className="btn primary block lg" onClick={share}>📤 Отправить ссылку</button>
            <div className="grid2" style={{ marginTop: 8 }}>
              <button className="btn" onClick={copy}>Скопировать</button>
              <button className="btn" onClick={open}>👀 Как видит заказчик</button>
            </div>
          </div>

          <div className="section-title">Куда поставить ссылку</div>
          <ul className="mc-where">
            <li><b>Авито</b> — в текст объявления: «Посчитайте стоимость сами: ссылка»</li>
            <li><b>WhatsApp</b> — в статус и в ответ на «сколько стоит?»</li>
            <li><b>ВК, Telegram-канал, визитка</b> — заказчик посчитает в любое время, даже ночью</li>
          </ul>

          <div className="section-title">Какие работы показывать</div>
          <p className="small muted" style={{ marginTop: -6 }}>{d.custom ? 'Выбрано вами.' : 'Сейчас — по вашей специальности.'} Отметьте то, что вы делаете.</p>
          {JOB_GROUPS.map(([g, ids]) => (
            <div key={g}>
              <div className="fw-group">{g}</div>
              <div className="list">
                {ids.map((id) => { const j = getJob(id)!; const on = d.jobs.includes(id); return (
                  <label key={id} className="list-item mc-job">
                    <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(id)} />
                    <span className="fw-li-ico" aria-hidden="true">{j.icon}</span>
                    <div className="grow"><div className="title">{j.title}</div><div className="xs muted">{j.text}</div></div>
                  </label>
                ); })}
              </div>
            </div>
          ))}
          <p className="small muted" style={{ marginTop: 14 }}>Цены — из вашего справочника. Поменяли цену в справочнике — калькулятор сразу считает по-новому. <Link to="/catalog">Открыть справочник цен →</Link></p>
        </>
      );
    }}</Load>
  );
}
