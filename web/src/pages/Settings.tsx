import { Link } from 'react-router-dom';
import React, { useEffect, useRef, useState } from 'react';
import { get, patch, post, del } from '../api';
import { prepareBrand } from '../photo';
import { useMe } from '../App';
import { Field, Load, Switch, useLoad, useToast } from '../components/ui';
import { date } from '../format';
import { openInvoice, haptic, tg } from '../tg';
import { THEMES, DEFAULT_THEME, applyTheme } from '../theme';
import Tariffs from '../components/Tariffs';
import AiSoon from '../components/AiSoon';
import AdminPromos from '../components/AdminPromos';

export default function Settings() {
  const { me, setMe, refreshMe } = useMe();
  const toast = useToast();
  const [company, setCompany] = useState(me.companyName || '');
  const [contacts, setContacts] = useState(me.contacts || '');
  useEffect(() => { setCompany(me.companyName || ''); setContacts(me.contacts || ''); }, [me.companyName, me.contacts]);

  return (
    <>
      <h1 className="page-title">Настройки и подписка</h1>

      <div className="panel">
        <div className="row between">
          <div>
            <div className="title" style={{ fontWeight: 700 }}>{({ subscription: `Тариф «${me.plan?.label || 'Про'}»`, team: 'Тариф «Бригада» (через бригадира)', trial: 'Пробный период «Про»', admin: 'Полный доступ (владелец)', expired: 'Подписка закончилась', free: 'Бесплатный доступ' } as any)[me.access.mode]}</div>
            <div className="small muted">{['subscription', 'trial', 'team'].includes(me.access.mode) ? `до ${date(me.access.until)} · осталось ${me.access.daysLeft} дн.` : me.access.mode === 'admin' ? 'Без ограничений' : me.access.freeEstimateLeft ? `Бесплатно: 3 сметы в месяц, в этом месяце осталось ${me.access.freeLeft ?? 3}.` : 'Бесплатные сметы этого месяца использованы — новые появятся 1-го числа. Все данные сохранены.'}</div>
            {me.plan?.aiLimit > 0 && <div className="xs muted">ИИ в этом месяце: {me.plan.aiUsed} из {me.plan.aiLimit}</div>}
          </div>
          <span className={`badge ${me.access.active ? 'ok' : 'bad'}`}>{me.access.active ? 'Доступ есть' : 'Нет доступа'}</span>
        </div>
      </div>

      <Referral />

      <Tariffs />
      {me.isAdmin && <Link to="/admin/stats" className="btn block" style={{ marginTop: 12 }}>📊 Статистика приложения</Link>}
      {me.isAdmin && <AdminPromos />}

      <h2 className="section-title">ИИ-сметчик</h2>
      {!me.aiAvailable ? <AiSoon compact /> : <div className="panel">
        <div className="row between">
          <div className="grow"><div style={{ fontWeight: 600 }}>{me.aiEnabled ? 'Включён' : 'Выключен'}</div>
            <div className="xs muted">{me.aiEnabled ? (me.aiAvailable ? 'Можно создавать сметы голосом и текстом.' : 'Голосовой сметчик ещё не подключён на сервере.') : 'Запросы к ИИ не отправляются. Сметы, калькуляторы, справочник и финансы работают вручную.'}</div></div>
          <Switch checked={me.aiEnabled} label="ИИ-помощник" onChange={async (v) => { try { setMe(await patch('/me', { aiEnabled: v })); } catch (e: any) { toast(e.message, true); } }} />
        </div>
      </div>}

      <h2 className="section-title">Документы: реквизиты, логотип, подпись</h2>
      <div className="panel stack">
        <Field label="Компания или имя мастера"><input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ИП Иванов Иван Иванович" /></Field>
        <Field label="Контакты и реквизиты" hint="Попадут в смету, договор и акт: телефон, ИНН/ОГРНИП, адрес, банк"><textarea className="textarea" style={{ minHeight: 96 }} value={contacts} onChange={(e) => setContacts(e.target.value)} placeholder={'+7 900 000-00-00, Telegram @…\nИНН 000000000000, ОГРНИП …\nр/с … в банке …'} /></Field>
        <button className="btn primary block" onClick={async () => { try { setMe(await patch('/me', { companyName: company || null, contacts: contacts || null })); toast('Сохранено'); } catch (e: any) { toast(e.message, true); } }}>Сохранить</button>
        <Field label="Вид сметы в PDF">
          <div className="seg">
            {[['classic', 'Классический — таблица с рамками'], ['modern', 'Современный']].map(([v, t]) => (
              <button key={v} className={`chip ${(me.docStyle || 'classic') === v ? 'on' : ''}`} onClick={async () => { try { setMe(await patch('/me', { docStyle: v })); toast('Вид документов изменён'); } catch (e: any) { toast(e.message, true); } }}>{t}</button>
            ))}
          </div>
        </Field>
        <div className="grid2">
          <BrandSlot kind="logo" title="Логотип" url={me.logoUrl} hint="PNG или фото, лучше квадратный" />
          <BrandSlot kind="sign" title="Подпись / печать" url={me.signUrl} hint="Распишитесь на белом листе и сфотографируйте" />
        </div>
      </div>

      <h2 className="section-title">Итоги недели в боте</h2>
      <div className="panel">
        <div className="row between">
          <div className="grow"><div style={{ fontWeight: 600 }}>{me.weeklyDigest ? 'Включены' : 'Выключены'}</div>
            <div className="xs muted">По понедельникам в 9:00: сколько получили и потратили, кто должен денег, напоминания на неделю.</div></div>
          <Switch checked={me.weeklyDigest} label="Итоги недели" onChange={async (v) => { try { setMe(await patch('/me', { weeklyDigest: v })); } catch (e: any) { toast(e.message, true); } }} />
        </div>
      </div>

      <h2 className="section-title">Оформление</h2>
      <div className="themes">
        {THEMES.map((t) => {
          const on = (THEMES.some((x) => x.id === me.theme) ? me.theme : DEFAULT_THEME) === t.id;
          return (
            <button key={t.id} className={`theme-card ${on ? 'on' : ''}`} aria-pressed={on}
              onClick={async () => { applyTheme(t.id); try { setMe(await patch('/me', { theme: t.id })); } catch (e: any) { toast(e.message, true); } }}>
              <div className={`sw th-${t.id}`}>СМЕТА</div>
              <div className="nm">{t.name}<div className="xs muted">{t.note}</div></div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function BrandSlot({ kind, title, url, hint }: { kind: 'logo' | 'sign'; title: string; url?: string | null; hint: string }) {
  const { setMe } = useMe();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try { const image = await prepareBrand(f, kind); setMe(await post(`/me/brand/${kind}`, { image })); haptic('success'); toast(`${title}: сохранено — появится во всех документах`); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="brand-slot">
      <div className="small" style={{ fontWeight: 600 }}>{title}</div>
      <button className="brand-box" onClick={() => ref.current?.click()} disabled={busy} aria-label={`${url ? 'Заменить' : 'Загрузить'}: ${title}`}>
        {busy ? <span className="xs muted">Загружаю…</span> : url ? <img src={url} alt={title} /> : <span className="xs muted">+ Загрузить</span>}
      </button>
      <div className="xs muted">{hint}</div>
      {url && !busy && <button className="btn ghost sm" onClick={async () => { try { setMe(await del(`/me/brand/${kind}`)); toast('Удалено'); } catch (e: any) { toast(e.message, true); } }}>Убрать</button>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

function Referral() {
  const toast = useToast();
  const r = useLoad(() => get<any>('/referrals'), []);
  const d = r.data;
  const text = 'Делаю сметы и считаю прибыль по объектам в СМЕТА PRO прямо в Telegram. 3 сметы каждый месяц — бесплатно:';
  const share = () => {
    if (!d?.link) return toast('Ссылка появится после запуска бота', true);
    const u = `https://t.me/share/url?url=${encodeURIComponent(d.link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
  };
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 18 }}>🎁 Приведи друга — получи месяц бесплатно</div>
      <div className="small muted" style={{ marginTop: 4 }}>Отправьте ссылку знакомому строителю. Когда он оформит подписку, вам добавится 1 месяц. Друзей — сколько угодно.</div>
      {d && (d.invited > 0) && <div className="small" style={{ marginTop: 8 }}>Пришло по ссылке: <b>{d.invited}</b> · оформили подписку: <b>{d.paid}</b>{d.paid ? ` · подарено месяцев: ${d.paid}` : ''}</div>}
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={share}>Пригласить</button>
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(d?.link || ''); toast('Ссылка скопирована'); } catch { toast('Не удалось скопировать', true); } }} disabled={!d?.link}>Скопировать</button>
      </div>
    </div>
  );
}
