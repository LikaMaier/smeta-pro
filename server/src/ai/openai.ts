import { env } from '../env';
import { HttpError } from '../util';

const OPENAI = 'https://api.openai.com/v1';

/** ИИ настроен: есть ключ OpenAI-совместимого сервиса */
export const aiConfigured = () => Boolean(env.AI_API_KEY);
/** Голос распознаём через OpenAI — нужен свой ключ OpenAI */
export const sttConfigured = () => Boolean(env.OPENAI_API_KEY);

async function openaiError(res: Response) {
  let msg = `${res.status}`;
  try { const j: any = await res.json(); msg = j?.error?.message || j?.message || msg; } catch { /* */ }
  if (res.status === 401 || res.status === 403) return new HttpError(502, 'Ключ ИИ не подошёл — проверьте AI_API_KEY', 'ai_key');
  if (res.status === 429) return new HttpError(503, 'ИИ: исчерпан лимит или нет средств на балансе', 'ai_quota');
  return new HttpError(502, `ИИ не ответил: ${msg}`, 'ai_upstream');
}

const aiHeaders = () => ({
  Authorization: `Bearer ${env.AI_API_KEY}`, 'Content-Type': 'application/json',
  ...(env.AI_FOLDER ? { 'OpenAI-Project': env.AI_FOLDER } : {}),
});
/** Yandex AI Studio ждёт модель в виде gpt://<каталог>/<модель>/latest — дописываем, если указано коротко */
const modelName = () => (env.AI_FOLDER && !env.AI_MODEL.includes('://') && env.AI_BASE_URL.includes('yandex') ? `gpt://${env.AI_FOLDER}/${env.AI_MODEL}` : env.AI_MODEL);

/** Чат со строгим JSON-ответом по схеме. Если сервис не умеет json_schema — повторяем с json_object. */
export async function chatJson<T>(messages: { role: string; content: string }[], schema: any): Promise<T> {
  const call = (format: any, msgs = messages) => fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: 'POST', headers: aiHeaders(),
    body: JSON.stringify({ model: modelName(), messages: msgs, temperature: 0.2, response_format: format }),
    signal: AbortSignal.timeout(60000),
  });
  let res = await call({ type: 'json_schema', json_schema: schema });
  if (!res.ok && res.status === 400) {
    // упрощённый режим: схему передаём текстом в системном сообщении
    const hint = { role: 'system', content: `Ответь ТОЛЬКО JSON-объектом по этой JSON-схеме, без пояснений:\n${JSON.stringify(schema.schema || schema)}` };
    res = await call({ type: 'json_object' }, [hint, ...messages]);
  }
  if (!res.ok) throw await openaiError(res);
  const j: any = await res.json();
  let text: string = j.choices?.[0]?.message?.content;
  if (!text) throw new HttpError(502, 'ИИ вернул пустой ответ', 'ai_upstream');
  text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(502, 'ИИ вернул неверный формат', 'ai_upstream'); }
}

/** Распознавание речи. Сначала основная модель, при ошибке модели — whisper-1 */
export async function transcribe(audio: Buffer, filename: string, mime: string): Promise<string> {
  if (!sttConfigured()) throw new HttpError(503, 'Голос пока не распознаётся — напишите текстом.', 'stt_unavailable');
  const run = async (model: string) => {
    const fd = new FormData();
    fd.append('file', new Blob([audio], { type: mime }), filename);
    fd.append('model', model);
    fd.append('language', 'ru');
    return fetch(`${OPENAI}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(90000) });
  };
  let res = await run(env.OPENAI_STT_MODEL);
  if (!res.ok && res.status === 400 && env.OPENAI_STT_MODEL !== 'whisper-1') res = await run('whisper-1');
  if (!res.ok) throw await openaiError(res);
  const j: any = await res.json();
  const text = String(j.text || '').trim();
  if (!text) throw new HttpError(422, 'Не удалось распознать речь. Запишите ещё раз или напишите текстом.', 'stt_empty');
  return text;
}
