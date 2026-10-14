import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { post, get, setToken, onApiError } from './api';
import { tg, inTelegram, initTelegram } from './tg';
import { Boundary, Icon, Sheet, State, ToastProvider } from './components/ui';
import QuickCalc from './components/QuickCalc';
import Calendar, { CalendarDay } from './pages/Calendar';
import { getCalculator } from '../../shared/calculators';
import Home from './pages/Home';
import Estimates from './pages/Estimates';
import EstimateEditor from './pages/EstimateEditor';
import Catalog from './pages/Catalog';
import Calculators, { CalculatorPage } from './pages/Calculators';
import Projects from './pages/Projects';
import ProjectPage from './pages/ProjectPage';
import Finance from './pages/Finance';
import Settings from './pages/Settings';
import AdminStats from './pages/AdminStats';
import Acts from './pages/Acts';
import Masters from './pages/Masters';
import Designer from './pages/Designer';
import Purchase from './pages/Purchase';
import Assistant from './pages/Assistant';
import More from './pages/More';
import Reminders from './pages/Reminders';
import Landscape from './pages/Landscape';
import FenceDesigner from './pages/FenceDesigner';
import SitePlan from './pages/SitePlan';
import MepDesigner from './pages/MepDesigner';
import Tools from './pages/Tools';
import NewEstimate from './pages/NewEstimate';
import Contacts from './pages/Contacts';
import { applyTheme } from './theme';

export interface Me {
  id: string; firstName?: string; companyName?: string | null; contacts?: string | null;
  aiEnabled: boolean; aiAvailable: boolean; aiWish?: boolean; promo?: { code: string; discountPct: number } | null; isAdmin: boolean; theme?: string; designPrices?: Record<string, number> | null; pay?: { yookassa: boolean; receipt: boolean };
  access: { active: boolean; mode: 'trial' | 'subscription' | 'team' | 'expired' | 'free' | 'admin'; tier?: 'free' | 'lite' | 'pro' | 'team'; until: string; daysLeft: number; freeEstimateLeft: boolean; freeLeft?: number; freeLimit?: number; freeEstimateIds?: string[]; estimateCount?: number };
  plan?: { tier: 'free' | 'lite' | 'pro' | 'team'; label: string; aiLimit: number; aiUsed: number; extraDesigns: number; team: 'owner' | 'member' | null };
}
const MeCtx = createContext<{ me: Me; setMe: (m: Me) => void; refreshMe: () => Promise<void> }>(null as any);
export const useMe = () => useContext(MeCtx);

const ROOTS = ['/'];

/** Заголовок экрана в шапке */
function titleOf(path: string): string {
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return 'СМЕТА PRO';
  const map: Record<string, string> = {
    estimates: 'Сметы', projects: 'Объекты', catalog: 'Справочник цен', calculators: 'Расчёты', finance: 'Финансы',
    notes: 'Заметки', assistant: 'ИИ-сметчик', settings: 'Настройки', more: 'Справочник и ещё', tools: '3D и расчёты', new: 'Новая смета', calendar: 'Календарь и деньги', reminders: 'Напоминания', contacts: 'Записная книжка', masters: 'Мастера', designer: 'Постройки 3D', landscape: 'Благоустройство', fence: 'Заборы и ворота 3D', site: 'План участка', mep: 'Электрика и сантехника 3D', admin: 'Статистика',
  };
  if (seg[0] === 'calculators' && seg[1]) return (getCalculator(seg[1])?.short || getCalculator(seg[1])?.title || 'Расчёт');
  if (seg[0] === 'estimates' && seg[2] === 'acts') return 'Акты';
  if (seg[0] === 'estimates' && seg[2] === 'purchase') return 'Закупка';
  if (seg[0] === 'estimates' && seg[1]) return 'Смета';
  if (seg[0] === 'projects' && seg[1]) return 'Объект';
  if (seg[0] === 'calendar' && seg[1]) return new Date(`${seg[1]}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return map[seg[0]] || 'СМЕТА PRO';
}

const Wrench = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-1 1-3.3-.9-8.6 8.6a2 2 0 0 1-2.8-2.8l8.6-8.6L13 7l1-1z" />
  </svg>
);
const CalcIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" {...p}>
    <rect x="3" y="2.5" width="18" height="19" rx="2.5" fill="#D9D9D9" />
    <rect x="5" y="4.5" width="14" height="4" rx="1" fill="#3B4A3B" />
    <text x="17.6" y="7.8" fontSize="3.4" fill="#F2D43C" textAnchor="end" fontWeight="700">90</text>
    {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={5 + c * 4.9} y={10.5 + r * 3.6} width="3.8" height="2.6" rx=".6" fill={c === 2 && r === 2 ? '#F2D43C' : '#8A8A8A'} />))}
  </svg>
);

function TopBar({ onCalc }: { onCalc: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const root = loc.pathname === '/';
  return (
    <header className="topbar"><div className="in">
      {!root && !inTelegram && <button aria-label="Назад" onClick={() => nav(-1)}><Icon.back /></button>}
      <h1 style={titleOf(loc.pathname).length > 13 ? { fontSize: 18 } : undefined}>{titleOf(loc.pathname)}</h1>
      <button aria-label="Калькулятор" onClick={onCalc}><CalcIcon /></button>
      <button aria-label="Настройки" onClick={() => nav('/settings')}><Wrench /></button>
    </div></header>
  );
}

/** Кнопка «Назад» Telegram на вложенных экранах */
function TgBack() {
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    if (!tg?.BackButton) return;
    const back = () => nav(-1);
    if (ROOTS.includes(loc.pathname)) tg.BackButton.hide(); else tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg.BackButton.offClick(back);
  }, [loc.pathname, nav]);
  return null;
}

function Paywall() {
  const [open, setOpen] = useState<false | string>(false);
  const nav = useNavigate();
  useEffect(() => onApiError((e) => { if (e.code === 'subscription_required') setOpen(''); if (e.code === 'plan_required') setOpen(e.message || ''); }), []);
  return (
    <Sheet open={open !== false} onClose={() => setOpen(false)} title={open ? 'Нужен тариф выше' : 'Нужна подписка'}>
      <div className="stack">
        <p style={{ margin: 0 }}>{open || 'Бесплатно — 3 сметы каждый месяц, справочник, мастера, календарь и напоминания. Сметы без ограничений, объекты и деньги, договоры, акты и 3D для заказчика — в тарифе «Про» за 590 ₽ в месяц.'}</p>
        <p className="small muted" style={{ margin: 0 }}>Все ваши данные сохранены и доступны для просмотра.</p>
        <button className="btn primary block lg" onClick={() => { setOpen(false); nav('/settings'); }}>Выбрать тариф</button>
      </div>
    </Sheet>
  );
}

function Shell({ me, setMe }: { me: Me; setMe: (m: Me) => void }) {
  const refreshMe = useCallback(async () => setMe(await get<Me>('/me')), [setMe]);
  const [calc, setCalc] = useState(false);
  useEffect(() => applyTheme(me.theme), [me.theme]);
  return (
    <MeCtx.Provider value={{ me, setMe, refreshMe }}>
      <BrowserRouter>
        <TgBack />
        <Paywall />
        <TopBar onCalc={() => setCalc(true)} />
        <QuickCalc open={calc} onClose={() => setCalc(false)} />
        <div className="app">
          {me.access.mode === 'expired' && (
            <NavLink to="/settings" className="banner bad" style={{ display: 'block' }}>
              Подписка закончилась. Данные сохранены и доступны для просмотра. Продлить подписку
            </NavLink>
          )}
          <Boundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/estimates" element={<Estimates />} />
              <Route path="/estimates/:id" element={<EstimateEditor />} />
              <Route path="/estimates/:id/acts" element={<Acts />} />
              <Route path="/estimates/:id/purchase" element={<Purchase />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/calculators" element={<Calculators />} />
              <Route path="/masters" element={<Masters />} />
              <Route path="/designer" element={<Designer />} />
              <Route path="/landscape" element={<Landscape />} />
              <Route path="/fence" element={<FenceDesigner />} />
              <Route path="/site" element={<SitePlan />} />
              <Route path="/mep" element={<MepDesigner />} />
              <Route path="/calculators/:id" element={<CalculatorPage />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectPage />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/notes" element={<Navigate to="/calendar" replace />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin/stats" element={<AdminStats />} />
              <Route path="/more" element={<More />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/new" element={<NewEstimate />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/reminders" element={<Reminders />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/calendar/:date" element={<CalendarDay />} />
              <Route path="*" element={<State title="Страница не найдена" />} />
            </Routes>
          </Boundary>
        </div>
      </BrowserRouter>
    </MeCtx.Provider>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initTelegram();
    (async () => {
      try {
        const params = new URLSearchParams(location.search);
        let r: any;
        if (inTelegram) r = await post('/auth/telegram', { initData: tg.initData });
        else if (params.get('dev')) r = await post('/auth/dev', { tgId: Number(params.get('dev')), name: 'Разработчик' });
        else { setError('Откройте СМЕТА PRO через Telegram-бота.'); return; }
        setToken(r.token);
        setMe(r.user);
      } catch (e: any) {
        setError(e.message || 'Не удалось войти');
      }
    })();
  }, []);

  return (
    <ToastProvider>
      {error ? (
        <div className="app"><div className="logo"><img src="/icon.svg" alt="" /><div><b>СМЕТА PRO</b><span>Считай точно. Работай прибыльно.</span></div></div><State title="Вход не выполнен" text={error} /></div>
      ) : me ? <Shell me={me} setMe={setMe} /> : <div className="spinner" aria-label="Загрузка" />}
    </ToastProvider>
  );
}
