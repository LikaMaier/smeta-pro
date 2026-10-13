/**
 * Уровни подписки: Бесплатно → Про → Бригада («Лайт» — только для уже оплативших, до конца срока).
 * Здесь только правила (что входит и сколько); цены и коды оплаты — в server/src/routes/billing.ts.
 */
export type Tier = 'free' | 'lite' | 'pro' | 'team';
export const TIER_RANK: Record<Tier, number> = { free: 0, lite: 1, pro: 2, team: 3 };

export interface TierInfo {
  label: string;
  /** PDF «Эскизный проект» (3D и чертежи): free — всего, платные — в месяц; Infinity — без ограничений */
  designPdf: number;
  /** запросов к ИИ в месяц (сметчик, разбор описания проекта) */
  ai: number;
  /** человек в бригаде вместе с владельцем */
  seats: number;
  perks: string[];
}

export const TIERS: Record<Tier, TierInfo> = {
  free: { label: 'Бесплатно', designPdf: 1, ai: 0, seats: 1, perks: ['3 сметы каждый месяц', 'мастера с ценами и варианты материалов', 'PDF сметы с пометкой «Сделано в СМЕТА PRO»', 'календарь и напоминания', '1 эскизный проект 3D с водяным знаком'] },
  // «Лайт» больше не продаётся: оплаченные подписки работают до конца срока
  lite: { label: 'Лайт', designPdf: 3, ai: 0, seats: 1, perks: ['сметы без ограничений', 'объекты, деньги и долги', 'договор, акты, КС-2 и КС-3, Excel', '3 эскизных проекта 3D в месяц'] },
  pro: { label: 'Про', designPdf: 5, ai: 300, seats: 1, perks: ['сметы без ограничений', 'PDF с вашим логотипом, без пометки', 'договор, акты, КС-2 и КС-3, Excel', 'объекты, деньги и долги', 'ссылка для заказчика с 3D', '5 эскизных проектов 3D в месяц', 'ИИ-сметчик: 300 запросов в месяц'] },
  team: { label: 'Бригада', designPdf: Infinity, ai: 1000, seats: 3, perks: ['всё из «Про»', 'от 3 человек, общий справочник цен', 'эскизные проекты 3D без ограничений', 'страницы для заказчика без «СМЕТА PRO»', 'ИИ: 1000 запросов в месяц'] },
};

/** Бригада: 3 человека в базовой цене, каждый следующий — доплата в месяц */
export const TEAM_BASE_SEATS = 3;
export const TEAM_BASE_RUB = 1490;
export const SEAT_RUB = 290;
export const teamMonthRub = (seats: number) => TEAM_BASE_RUB + Math.max(0, seats - TEAM_BASE_SEATS) * SEAT_RUB;
/** Кому из участников достаётся оплаченное место: первым вступившим (владелец занимает одно место) */
export function teamSeatHolders<T extends { id: string; joined: number }>(members: T[], seats: number): Set<string> {
  return new Set([...members].sort((a, b) => a.joined - b.joined).slice(0, Math.max(0, seats - 1)).map((m) => m.id));
}
/** Мест в бригаде у владельца: из оплаченного тарифа; старые подписки «Бригада» — 5 мест, как было */
export const seatsOf = (u: { teamSeats?: number | null }) => (u.teamSeats && u.teamSeats > 0 ? u.teamSeats : 5);

/** Возможности, которые открываются с определённого уровня */
export const FEATURE_TIER = {
  docs: 'lite',       // договор, акты, КС, Excel
  projects: 'lite',   // объекты и финансы
  ai: 'pro',
  share3d: 'pro',
  team: 'team',
  whiteLabel: 'team',
} as const satisfies Record<string, Tier>;
export type Feature = keyof typeof FEATURE_TIER;

export const can = (tier: Tier, f: Feature) => TIER_RANK[tier] >= TIER_RANK[FEATURE_TIER[f]];
export const FEATURE_MSG: Record<Feature, string> = {
  docs: 'Договор, акты, КС-2/КС-3 и Excel — в тарифе «Про».',
  projects: 'Объекты и учёт денег — в тарифе «Про».',
  ai: 'ИИ — в тарифах «Про» и «Бригада».',
  share3d: 'Ссылка с 3D для заказчика — в тарифах «Про» и «Бригада».',
  team: 'Бригада из нескольких человек — в тарифе «Бригада».',
  whiteLabel: 'Страницы без «СМЕТА PRO» — в тарифе «Бригада».',
};

/** Месяц для счётчиков: «2026-10» по Москве */
export const monthKey = (d = new Date()) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 7);

/** Перевод остатка подписки при смене уровня: оставшиеся дни × старая цена / новая цена */
export function convertDays(daysLeft: number, oldMonthRub: number, newMonthRub: number) {
  if (daysLeft <= 0 || !oldMonthRub || !newMonthRub) return 0;
  return Math.floor((daysLeft * oldMonthRub) / newMonthRub);
}
