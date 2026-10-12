import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError, prisma, audit, accessOf } from '../util';
import { env } from '../env';
import { assertAiAllowed, handleMessage, getSession, resetSession, createEstimateFromDraft } from '../ai/assistant';
import { transcribe, aiConfigured } from '../ai/openai';

export { assertAiAllowed };

/**
 * ИИ-сметчик. Сервер проверяет переключатель aiEnabled на каждом запросе:
 * при выключенном ИИ запросы к OpenAI не отправляются.
 */
/** ИИ подключили — один раз сообщаем всем, кто нажал «Жду ИИ» */
export async function notifyAiWishers(bot: any, appUrl: string, log: { error: (o: any, m?: string) => void }) {
  if (!aiConfigured()) return;
  const wishes = await prisma.auditLog.findMany({ where: { entity: 'ai', action: 'wish' }, include: { user: true } });
  for (const w of wishes) {
    const claimed = await prisma.auditLog.updateMany({ where: { id: w.id, action: 'wish' }, data: { action: 'wish_notified' } });
    if (!claimed.count) continue;
    await bot.api.sendMessage(Number(w.user.tgId), '🤖 ИИ-сметчик заработал! Перескажите заказ голосом или текстом — соберу черновик сметы по вашим ценам. Доступно в тарифах «Про» и «Бригада».',
      appUrl ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть ИИ-сметчик', web_app: { url: `${appUrl}/assistant` } }]] } } : {}).catch((e: any) => log.error({ err: e }, 'ai wish notify'));
  }
}

export async function aiRoutes(app: FastifyInstance) {
  app.get('/api/ai/session', async (req) => getSession(req.user.id));

  // «Жду ИИ»: копим желающих, чтобы решить, когда подключать платный ИИ
  app.post('/api/ai/wish', async (req) => {
    const had = await prisma.auditLog.findFirst({ where: { userId: req.user.id, entity: 'ai', action: { in: ['wish', 'wish_notified'] } } });
    if (!had) await audit(req.user.id, 'ai', '-', 'wish', { tier: accessOf(req.user).tier });
    return { ok: true };
  });
  // сколько ждут ИИ (только для владельца приложения)
  app.get('/api/ai/wishes', async (req) => {
    if (!env.ADMIN_TG_IDS.includes(String(req.user.tgId))) throw new HttpError(403, 'Только для администратора');
    const rows = await prisma.auditLog.findMany({ where: { entity: 'ai', action: { in: ['wish', 'wish_notified'] } }, select: { userId: true, user: { select: { plan: true, subscriptionUntil: true } } } });
    const users = new Map(rows.map((r) => [r.userId, r.user]));
    const paying = [...users.values()].filter((u) => u.subscriptionUntil && u.subscriptionUntil > new Date()).length;
    return { total: users.size, paying };
  });

  app.post('/api/ai/message', async (req) => {
    const { text } = z.object({ text: z.string().trim().min(1, 'напишите сообщение').max(4000) }).parse(req.body);
    return handleMessage(req.user, text);
  });

  app.post('/api/ai/voice', { bodyLimit: 15 * 1024 * 1024 }, async (req) => {
    assertAiAllowed(req.user);
    const { audio, mime } = z.object({ audio: z.string().min(10), mime: z.string().max(100) }).parse(req.body);
    const b64 = audio.includes(',') ? audio.slice(audio.indexOf(',') + 1) : audio;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 500) throw new HttpError(422, 'Запись слишком короткая — попробуйте ещё раз', 'stt_empty');
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    const text = await transcribe(buf, `voice.${ext}`, mime.split(';')[0]);
    return { transcript: text, ...(await handleMessage(req.user, text, true)) };
  });

  app.post('/api/ai/reset', async (req) => { await resetSession(req.user.id); return { ok: true }; });

  app.post('/api/ai/create-estimate', async (req) => {
    assertAiAllowed(req.user);
    const e = await createEstimateFromDraft(req.user);
    return { estimateId: e.id };
  });
}
