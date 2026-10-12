/**
 * Уровни подписки: Бесплатно → Лайт → Про → Бригада.
 * Здесь только правила (что входит и сколько); цены и коды оплаты — в server/src/routes/billing.ts.
 */
export type Tier = 'free' | 'lite' | 'pro' | 'team';
export const TIER_RANK: Record<Tier, number> = { free: 0, lite: 1, pro: 2, team: 3 };

export interface TierInfo {
  label: string;
  /** PDF «Эскизный проект» (3D и чертежи): free — всего, lite — в месяц; Infinity — без ограничений */
  designPdf: number;
  /** запросов к ИИ в месяц (сметчик, разбор описания проекта) */
  ai: number;
  /** человек в бригаде вместе с владельцем */
  seats: number;
  perks: string[];
}

export const TIERS: Record<Tier, TierInfo> = {
  free: { label: 'Бесплатно', designPdf: 1, ai: 0, seats: 1, perks: ['3 сметы', 'PDF сметы', 'справочник цен и калькуляторы', 'календарь и напоминания', '1 эскизный проект 3D'] },
  lite: { label: 'Лайт', designPdf: 3, ai: 0, seats: 1, perks: ['сметы без ограничений', 'объекты, деньги и долги', 'договор, акты, КС-2 и КС-3, Excel', '3 эскизных проекта 3D в месяц'] },
  pro: { label: 'Про', designPdf: Infinity, ai: 300, seats: 1, perks: ['всё из Лайт', 'ИИ-сметчик: 300 запросов в месяц', 'проектировщик 3D без ограничений', 'ссылка с 3D для заказчика'] },
  team: { label: 'Бригада', designPdf: Infinity, ai: 1000, seats: 5, perks: ['всё из Про', 'до 5 человек: общий справочник цен', 'ИИ: 1000 запросов в месяц', 'страницы для заказчика без «СМЕТА PRO» — только ваша компания'] },
};

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
  docs: 'Договор, акты, КС-2/КС-3 и Excel — с тарифа «Лайт».',
  projects: 'Объекты и учёт денег — с тарифа «Лайт».',
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
