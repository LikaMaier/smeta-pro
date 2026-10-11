import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../util';
import { assertAiAllowed, handleMessage, getSession, resetSession, createEstimateFromDraft } from '../ai/assistant';
import { transcribe } from '../ai/openai';

export { assertAiAllowed };

/**
 * ИИ-сметчик. Сервер проверяет переключатель aiEnabled на каждом запросе:
 * при выключенном ИИ запросы к OpenAI не отправляются.
 */
export async function aiRoutes(app: FastifyInstance) {
  app.get('/api/ai/session', async (req) => getSession(req.user.id));

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
