/** Промокод: верхний регистр, только буквы, цифры, «-» и «_», до 24 знаков */
export const normCode = (s: string) => s.trim().toUpperCase().replace(/[^A-ZА-ЯЁ0-9_-]/g, '').slice(0, 24);
