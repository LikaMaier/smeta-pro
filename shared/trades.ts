/** «Чем занимаетесь?» — первый вопрос бота. id направления — из shared/directions.ts */
export const TRADES: { id: string; dir: string | null; label: string }[] = [
  { id: 'finish', dir: 'finish', label: '🎨 Отделка' },
  { id: 'tile', dir: 'tile', label: '🧱 Плитка' },
  { id: 'floor', dir: 'floor', label: '🪵 Полы' },
  { id: 'roof', dir: 'roof', label: '🏠 Кровля' },
  { id: 'yard', dir: 'yard', label: '🚧 Заборы, участок' },
  { id: 'found', dir: 'found', label: '🏗 Фундамент' },
  { id: 'house', dir: 'house', label: '🏡 Дома и бани' },
  { id: 'windows', dir: 'windows', label: '🪟 Окна и двери' },
  { id: 'electric', dir: 'electric', label: '⚡ Электрика' },
  { id: 'plumb', dir: 'plumb', label: '🚿 Сантехника' },
  { id: 'climate', dir: 'climate', label: '❄️ Кондиционеры' },
  { id: 'other', dir: null, label: '🧰 Всё понемногу' },
];
export const tradeOf = (id?: string | null) => TRADES.find((t) => t.id === id) || null;
/** Пример для сообщения «первая смета» по специальности */
export const TRADE_EXAMPLE: Record<string, string> = {
  finish: 'комната 18 м²: штукатурка, шпаклёвка, покраска — материалы и итог посчитаются сами',
  tile: 'санузел 2×1,6 м: плитка, гидроизоляция, затирка, инсталляция',
  floor: 'ламинат 40 м² с подложкой, плинтусом и порогами',
  roof: 'двускатная крыша 10×8 м: стропила, мембраны, металлочерепица, водосток',
  yard: 'забор из профлиста 50 м с воротами и калиткой',
  found: 'ленточный фундамент 10×8 м: земляные работы, арматура, бетон',
  house: 'каркасный дом 8×6 м от свай до кровли',
  windows: 'три окна с откосами, подоконниками и отливами',
  electric: 'проводка в квартире: точки, щит, кабель, штробы',
  plumb: 'санузел: разводка воды и канализации, приборы',
  climate: 'две сплит-системы с трассой и монтажом',
};
