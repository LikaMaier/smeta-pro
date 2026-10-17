/** Промокод: верхний регистр, только буквы, цифры, «-» и «_», до 24 знаков */
export const normCode = (s: string) => s.trim().toUpperCase().replace(/[^A-ZА-ЯЁ0-9_-]/g, '').slice(0, 24);

/** Метка рекламного канала из ссылки запуска бота (?start=card, vk, chat_prorab…); служебные ref_/p_/team_/biz/help — не метки */
export function channelTag(payload?: string | null) {
  const p = (payload || '').trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(p) || /^(ref_|p_|team_|biz)/.test(p) || p === 'help' || p === 'guide') return null;
  return p.toLowerCase();
}
