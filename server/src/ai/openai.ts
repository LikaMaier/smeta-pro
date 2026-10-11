import { env } from '../env';
import { HttpError } from '../util';

const BASE = 'https://api.openai.com/v1';

async function openaiError(res: Response) {
  let msg = `${res.status}`;
  try { const j: any = await res.json(); msg = j?.error?.message || msg; } catch { /* */ }
  if (res.status === 401) return new HttpError(502, 'Ключ OpenAI не подошёл — проверьте OPENAI_API_KEY', 'ai_key');
  if (res.status === 429) return new HttpError(503, 'OpenAI: исчерпан лимит или нет средств на балансе', 'ai_quota');
  return new HttpError(502, `OpenAI не ответил: ${msg}`, 'ai_upstream');
}

/** Чат со строгим JSON-ответом по схеме */
export async function chatJson<T>(messages: { role: string; content: string }[], schema: any): Promise<T> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL, messages, temperature: 0.2, response_format: { type: 'json_schema', json_schema: schema } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw await openaiError(res);
  const j: any = await res.json();
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new HttpError(502, 'OpenAI вернул пустой ответ', 'ai_upstream');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(502, 'OpenAI вернул неверный формат', 'ai_upstream'); }
}

/** Распознавание речи. Сначала основная модель, при ошибке модели — whisper-1 */
export async function transcribe(audio: Buffer, filename: string, mime: string): Promise<string> {
  const run = async (model: string) => {
    const fd = new FormData();
    fd.append('file', new Blob([audio], { type: mime }), filename);
    fd.append('model', model);
    fd.append('language', 'ru');
    return fetch(`${BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(90000) });
  };
  let res = await run(env.OPENAI_STT_MODEL);
  if (!res.ok && res.status === 400 && env.OPENAI_STT_MODEL !== 'whisper-1') res = await run('whisper-1');
  if (!res.ok) throw await openaiError(res);
  const j: any = await res.json();
  const text = String(j.text || '').trim();
  if (!text) throw new HttpError(422, 'Не удалось распознать речь. Запишите ещё раз или напишите текстом.', 'stt_empty');
  return text;
}
