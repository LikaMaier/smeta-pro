import { tg } from './tg';

export const THEMES = [
  { id: 'steel', name: 'Сталь и янтарь', bg: 'linear-gradient(160deg,#222B35,#13171C)', fg: '#FFB23F', header: '#161B21' },
  { id: 'gold', name: 'Золото и шоколад', bg: 'linear-gradient(160deg,#4A2410,#2A1206)', fg: '#F2D43C', header: '#3A1806' },
  { id: 'carbon', name: 'Карбон и жёлтый', bg: 'linear-gradient(160deg,#262626,#161616)', fg: '#FFE01B', header: '#1C1C1C' },
  { id: 'blueprint', name: 'Синий чертёж', bg: 'linear-gradient(160deg,#16395F,#0D2440)', fg: '#FFFFFF', header: '#0D2440' },
  { id: 'malachite', name: 'Малахит', bg: 'linear-gradient(160deg,#1C3F34,#0E211B)', fg: '#F2C94C', header: '#0F261F' },
];

export function applyTheme(id?: string) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0]; // по умолчанию — «Сталь и янтарь»
  document.documentElement.dataset.theme = t.id;
  try { tg?.setHeaderColor?.(t.header); tg?.setBackgroundColor?.(t.header); } catch { /* */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.header);
}
