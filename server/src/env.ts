// Все секреты — только из переменных окружения сервера.
export const env = {
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL || '',
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  // Публичный адрес приложения (https://xxx.up.railway.app) — для webhook и кнопки Mini App
  PUBLIC_URL: (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/$/, ''),
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  ADMIN_TG_IDS: (process.env.ADMIN_TG_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // пробный период тарифа «Про» для новых пользователей, дней
  PRO_TRIAL_DAYS: Number(process.env.PRO_TRIAL_DAYS ?? 7),
  // Только для локальной разработки вне Telegram. На проде не включать.
  DEV_AUTH: process.env.DEV_AUTH === '1',
  // ИИ. Любой OpenAI-совместимый сервис: OpenAI, YandexGPT (AI Studio), DeepSeek, OpenRouter.
  // Без ключа ИИ честно отключён. Распознавание голоса — только через OpenAI (OPENAI_API_KEY).
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe',
  AI_BASE_URL: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  AI_API_KEY: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  AI_FOLDER: process.env.AI_FOLDER || '', // Yandex AI Studio: ID каталога (заголовок OpenAI-Project)
  AI_PROVIDER: process.env.AI_API_KEY || process.env.OPENAI_API_KEY ? 'on' : '',
  // ЮKassa: оплата картой и СБП. Без ключей кнопка оплаты через ЮKassa скрыта.
  YOOKASSA_SHOP_ID: process.env.YOOKASSA_SHOP_ID || '',
  YOOKASSA_SECRET_KEY: process.env.YOOKASSA_SECRET_KEY || '',
  YOOKASSA_RECEIPT: process.env.YOOKASSA_RECEIPT === '1', // отправлять чек 54-ФЗ (нужен email покупателя)
  YOOKASSA_VAT_CODE: Number(process.env.YOOKASSA_VAT_CODE || 1), // 1 — без НДС
};

export function assertEnv() {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.SESSION_SECRET && !env.DEV_AUTH) missing.push('SESSION_SECRET');
  // BOT_TOKEN не обязателен для старта: без него сервер работает, но вход через Telegram и оплата отключены
  if (!env.BOT_TOKEN && !env.DEV_AUTH) console.warn('BOT_TOKEN не задан — вход через Telegram и оплата недоступны');
  if (missing.length) throw new Error(`Не заданы переменные окружения: ${missing.join(', ')}`);
}
