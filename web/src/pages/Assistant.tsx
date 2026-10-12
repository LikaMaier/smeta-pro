import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch } from '../api';
import { useMe } from '../App';
import { Load, State, Switch, useLoad, useToast } from '../components/ui';
import { rub, n, TYPE_LABEL } from '../format';
import { haptic } from '../tg';
import AiSoon from '../components/AiSoon';

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';

export default function Assistant() {
  const { me, setMe } = useMe();
  const toast = useToast();
  if (!me.aiAvailable) return <AiSoon />;
  const toggle = async (v: boolean) => { try { setMe(await patch('/me', { aiEnabled: v })); toast(v ? 'ИИ-сметчик включён' : 'ИИ-сметчик выключен'); } catch (e: any) { toast(e.message, true); } };
  return (
    <>
      <div className="panel row between" style={{ marginBottom: 12 }}>
        <div className="grow"><b>{me.aiEnabled ? 'ИИ-сметчик включён' : 'ИИ-сметчик выключен'}</b>
          <div className="xs muted">{me.aiEnabled ? 'Запросы отправляются в OpenAI. Выключите, когда не нужен.' : 'Запросы к ИИ не отправляются. Включите, когда понадобится.'}</div></div>
        <Switch checked={me.aiEnabled} onChange={toggle} label="ИИ-сметчик" />
      </div>
      {!me.aiEnabled ? (
        <State title="Сметы по голосу и тексту" text="Перескажите заказ клиента голосом — ИИ задаст уточняющие вопросы по одному и соберёт черновик сметы по вашим ценам. Расчёты делают проверенные калькуляторы, а не нейросеть." />
      ) : !me.aiAvailable ? (
        <State title="ИИ-сметчик ещё не подключён" text="На сервере нет ключа OpenAI. Сметы, калькуляторы и финансы работают вручную." />
      ) : <Chat />}
    </>
  );
}

function Chat() {
  const nav = useNavigate();
  const toast = useToast();
  const session = useLoad(() => get<any>('/ai/session'), []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<any>();
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [session.data?.messages?.length, busy]);

  const send = async (t?: string) => {
    const msg = (t ?? text).trim();
    if (!msg) return;
    setBusy('ИИ думает…'); setText('');
    session.setData({ ...(session.data || { messages: [] }), messages: [...(session.data?.messages || []), { role: 'user', text: msg }] });
    try { session.setData(await post('/ai/message', { text: msg })); }
    catch (e: any) { toast(e.message, true); session.reload(); setText(msg); } finally { setBusy(''); }
  };

  const startRec = async () => {
    if (!(window as any).MediaRecorder) return toast('Запись голоса не поддерживается на этом устройстве — отправьте голосовое прямо в чат бота', true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        const blob = new Blob(chunks.current, { type: r.mimeType || mime || 'audio/webm' });
        if (blob.size < 1500) return toast('Запись слишком короткая', true);
        setBusy('Распознаю голос…');
        try { session.setData(await post('/ai/voice', { audio: await blobToDataUrl(blob), mime: blob.type })); haptic('success'); }
        catch (e: any) { toast(e.message, true); } finally { setBusy(''); }
      };
      r.start();
      setRec(r); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => { if (s >= 179) r.stop(); return s + 1; }), 1000);
      haptic('light');
    } catch {
      toast('Нет доступа к микрофону. Разрешите его или отправьте голосовое в чат бота.', true);
    }
  };
  const stopRec = () => { rec?.stop(); setRec(null); };

  const createEstimate = async () => {
    setBusy('Создаю смету…');
    try { const r = await post('/ai/create-estimate'); haptic('success'); nav(`/estimates/${r.estimateId}`); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(''); }
  };
  const reset = async () => { await post('/ai/reset'); session.reload(); };

  return (
    <Load state={session}>{(s) => (
      <>
        {s.messages.length === 0 && (
          <div className="box" style={{ marginBottom: 12, fontWeight: 500 }}>
            Скажите или напишите заказ, например: «Нужно залить площадку 6 на 4, толщина 15 сантиметров, с бордюром».
            <span className="line2 small" style={{ color: 'var(--muted)', marginTop: 6 }}>Можно и прямо в чат бота голосовым сообщением.</span>
          </div>
        )}
        <div className="stack">
          {s.messages.map((m: any, i: number) => (
            <div key={i} className="panel" style={{ marginLeft: m.role === 'user' ? 40 : 0, marginRight: m.role === 'user' ? 0 : 40, background: m.role === 'user' ? 'var(--surface-2)' : undefined, padding: '10px 12px' }}>
              <div className="xs muted">{m.role === 'user' ? (m.voice ? '🎙 Вы (голосом)' : 'Вы') : 'ИИ-сметчик'}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
          {busy && <div className="small muted">{busy}</div>}
        </div>

        {s.draft?.lines?.length > 0 && <Draft draft={s.draft} onCreate={createEstimate} busy={!!busy} />}

        <div ref={bottom} />
        <div className="totalbar"><div className="in" style={{ gap: 8 }}>
          {rec ? (
            <button className="btn primary block lg" onClick={stopRec}>■ Остановить запись · {secs} с</button>
          ) : (
            <>
              <button className="icon-btn" style={{ width: 52, height: 52, fontSize: 24 }} aria-label="Записать голос" onClick={startRec} disabled={!!busy}>🎙</button>
              <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Напишите ответ или заказ" onKeyDown={(e) => e.key === 'Enter' && send()} disabled={!!busy} />
              <button className="btn primary" onClick={() => send()} disabled={!!busy || !text.trim()}>➤</button>
            </>
          )}
        </div></div>
        <div style={{ height: 90 }} />
        {s.messages.length > 0 && <button className="btn ghost block" onClick={reset}>Начать новый расчёт</button>}
      </>
    )}</Load>
  );
}

function Draft({ draft, onCreate, busy }: { draft: any; onCreate: () => void; busy: boolean }) {
  const total = draft.lines.reduce((a: number, l: any) => a + l.qty * l.price, 0);
  return (
    <>
      <h2 className="section-title">Черновик сметы</h2>
      <div className="list">
        {draft.lines.map((l: any, i: number) => (
          <div key={i} className={`line ${l.unconfirmed ? 'unconfirmed' : ''}`}>
            <div className="row between"><b>{l.name}</b><b className="num">{rub(Math.round(l.qty * l.price * 100) / 100)}</b></div>
            <div className="xs muted">{n(l.qty, 3)} {l.unit} × {rub(l.price)} · {TYPE_LABEL[l.type] || l.type}
              {' · '}{l.priceSource === 'catalog' ? 'цена из справочника' : l.priceSource === 'approx' ? 'примерная цена' : 'цену укажите'}</div>
            {l.note && <div className="xs" style={{ color: 'var(--accent)' }}>{l.note}</div>}
          </div>
        ))}
      </div>
      <div className="row between" style={{ margin: '8px 0' }}><span className="muted">Предварительно</span><b className="num">{rub(Math.round(total * 100) / 100)}</b></div>
      {draft.assumptions?.length > 0 && <div className="banner">Допущения: {draft.assumptions.join('; ')}</div>}
      {draft.problems?.length > 0 && <div className="banner bad">Проверьте: {draft.problems.join('; ')}</div>}
      <button className="btn primary block lg" onClick={onCreate} disabled={busy}>Создать смету из черновика</button>
      <p className="xs muted">Перед отправкой заказчику проверьте позиции, отмеченные жёлтой полосой.</p>
    </>
  );
}
