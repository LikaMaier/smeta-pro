/** Имя бота (для ссылок «Приведи друга» и подвала страницы заказчика). Заполняется при запуске из getMe. */
export const botInfo = { username: process.env.BOT_USERNAME || '' };

export const botLink = (payload?: string) =>
  botInfo.username ? `https://t.me/${botInfo.username}${payload ? `?start=${encodeURIComponent(payload)}` : ''}` : '';
