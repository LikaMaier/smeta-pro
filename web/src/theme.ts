import { tg } from './tg';

/** Темы: цвет и внутренний рисунок фона (сам рисунок — в styles.css, класс th-<id> для превью) */
export const THEMES = [
  { id: 'blueprint', name: 'Синий чертёж', note: 'сетка миллиметровки', header: '#0D2440' },
  { id: 'brick', name: 'Кирпичная кладка', note: 'терракота, кладка со швами', header: '#241310' },
  { id: 'concrete', name: 'Бетон', note: 'графит, поры и опалубка', header: '#17191B' },
  { id: 'rebar', name: 'Арматурная сетка', note: 'сталь и сварная сетка', header: '#10171F' },
  { id: 'wood', name: 'Дерево', note: 'орех и волокна доски', header: '#1E140D' },
  { id: 'topo', name: 'Геодезия', note: 'горизонтали рельефа', header: '#0E1D1A' },
  { id: 'hazard', name: 'Стройплощадка', note: 'сигнальная лента', header: '#141414' },
  { id: 'paving', name: 'Плитка', note: 'соты тротуарной плитки', header: '#141A21' },
];
export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'blueprint';

export function applyTheme(id?: string) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0]; // старые и неизвестные темы → «Синий чертёж»
  document.documentElement.dataset.theme = t.id;
  try { tg?.setHeaderColor?.(t.header); tg?.setBackgroundColor?.(t.header); } catch { /* */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.header);
}
