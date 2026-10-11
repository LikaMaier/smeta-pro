import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { post, get, setToken, onApiError } from './api';
import { tg, inTelegram, initTelegram } from './tg';
import { Boundary, Icon, State, ToastProvider, useToast } from './components/ui';
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
import Notes from './pages/Notes';
import Settings from './pages/Settings';
import Assistant from './pages/Assistant';
import More from './pages/More';

export interface Me {
  id: string; firstName?: string; companyName?: string | null; contacts?: string | null;
  aiEnabled: boolean; aiAvailable: boolean; isAdmin: boolean;
  access: { active: boolean; mode: 'trial' | 'subscription' | 'expired'; until: string; daysLeft: number };
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
    notes: 'Заметки', assistant: 'ИИ-помощник', settings: 'Настройки', more: 'Меню', calendar: 'Календарь',
  };
  if (seg[0] === 'calculators' && seg[1]) return (getCalculator(seg[1])?.short || getCalculator(seg[1])?.title || 'Расчёт');
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
      <h1>{titleOf(loc.pathname)}</h1>
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

function ApiErrorToasts() {
  const toast = useToast();
  useEffect(() => onApiError((e) => {
    if (e.code === 'subscription_required') toast('Требуется подписка. Данные сохранены — продлите доступ в настройках.', true);
  }), [toast]);
  return null;
}

function Shell({ me, setMe }: { me: Me; setMe: (m: Me) => void }) {
  const refreshMe = useCallback(async () => setMe(await get<Me>('/me')), [setMe]);
  const [calc, setCalc] = useState(false);
  return (
    <MeCtx.Provider value={{ me, setMe, refreshMe }}>
      <BrowserRouter>
        <TgBack />
        <ApiErrorToasts />
        <TopBar onCalc={() => setCalc(true)} />
        <QuickCalc open={calc} onClose={() => setCalc(false)} />
        <div className="app">
          {!me.access.active && (
            <NavLink to="/settings" className="banner bad" style={{ display: 'block' }}>
              Подписка закончилась. Сметы и финансы доступны для просмотра, изменения — после продления. Открыть тарифы
            </NavLink>
          )}
          <Boundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/estimates" element={<Estimates />} />
              <Route path="/estimates/:id" element={<EstimateEditor />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/calculators" element={<Calculators />} />
              <Route path="/calculators/:id" element={<CalculatorPage />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectPage />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/more" element={<More />} />
              <Route path="/calendar" element={<Calendar />} />
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
