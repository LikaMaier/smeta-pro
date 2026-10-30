/**
 * Бонус за подписку на Instagram: после 1 дня пробного — ещё 12 дней «Про» бесплатно.
 * Как проверяем: у каждого пользователя свой код (5 цифр). Он подписывается на аккаунт и пишет код
 * в комментарии под любым роликом. Агент Instagram раз в 10 минут читает комментарии, находит код,
 * продлевает пробный период и отвечает под комментарием. Один код — один раз, один Instagram-аккаунт — один бонус.
 * (Сам факт подписки Instagram API не отдаёт — комментарий с кодом подтверждает, что человек зашёл в аккаунт.)
 */
import crypto from 'node:crypto';
import { prisma } from './util';

export const IG_BONUS_DAYS = 12;
const D = 864e5;
const get = async (key: string) => (await prisma.appKV.findUnique({ where: { key } }))?.value ?? null;
const claim = async (key: string, value: string) => { try { await prisma.appKV.create({ data: { key, value } }); return true; } catch { return false; } };

export const igUsername = async () => (await get('ig:username')) || 'cmeta_pro';
export const igUrl = async () => `https://instagram.com/${await igUsername()}`;

/** Личный код пользователя (создаётся при первом обращении) */
export async function bonusCode(userId: string): Promise<string> {
  const have = await get(`igb:u:${userId}`);
  if (have) return have;
  for (let i = 0; i < 20; i++) {
    const code = String(crypto.randomInt(10000, 100000));
    if (await claim(`igb:c:${code}`, userId)) {
      if (await claim(`igb:u:${userId}`, code)) return code;
      await prisma.appKV.deleteMany({ where: { key: `igb:c:${code}` } });
      return (await get(`igb:u:${userId}`))!;
    }
  }
  throw new Error('Не удалось выдать код');
}

export const bonusDone = async (userId: string) => Boolean(await get(`igb:done:${userId}`));

export async function bonusView(userId: string) {
  const done = await bonusDone(userId);
  return { days: IG_BONUS_DAYS, done, code: done ? null : await bonusCode(userId), ig: await igUsername(), url: await igUrl() };
}

export { codeIn } from '../../shared/igCode';

export type BonusResult = { status: 'granted'; userId: string; tgId: bigint; until: Date } | { status: 'used' | 'igUsed' | 'unknown' };

/** Начислить бонус по коду из комментария пользователя Instagram */
export async function grantByCode(code: string, igUser: string): Promise<BonusResult> {
  const userId = await get(`igb:c:${code}`);
  if (!userId) return { status: 'unknown' };
  if (await get(`igb:done:${userId}`)) return { status: 'used' };
  const ig = (igUser || '').toLowerCase();
  if (ig && !(await claim(`igb:ig:${ig}`, userId))) return { status: 'igUsed' };
  if (!(await claim(`igb:done:${userId}`, ig || '?'))) return { status: 'used' };
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return { status: 'unknown' };
  const base = Math.max(Date.now(), u.trialEndsAt.getTime());
  const until = new Date(base + IG_BONUS_DAYS * D);
  // сбрасываем отметки «пробный закончился», чтобы в конце бонуса снова пришли напоминания
  await prisma.user.update({ where: { id: userId }, data: { trialEndsAt: until, trialWarnAt: null, trialEndAt: null } });
  return { status: 'granted', userId, tgId: u.tgId, until };
}

export const bonusHowTo = (code: string, ig: string, url: string) =>
  `🎁 <b>+${IG_BONUS_DAYS} дней «Про» бесплатно</b> — за подписку на наш Instagram:\n\n` +
  `1. Подпишитесь на <a href="${url}">@${ig}</a>\n` +
  `2. Под любым роликом напишите комментарий с кодом <b>${code}</b>\n\n` +
  `В течение 10 минут бонус начислится сам, и я пришлю сюда подтверждение. Ролики — короткие разборы стройки: как правильно и сколько стоит.`;
