import React, { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useMe } from '../App';
import { useToast } from './ui';
import { haptic } from '../tg';

/** ИИ ещё не подключён: честно говорим «скоро» и собираем желающих — по их числу решаем, когда подключать */
export default function AiSoon({ compact = false }: { compact?: boolean }) {
  const { me, refreshMe } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [stat, setStat] = useState<{ total: number; paying: number } | null>(null);
  useEffect(() => { if (me.isAdmin) get('/ai/wishes').then(setStat).catch(() => {}); }, [me.isAdmin, me.aiWish]);
  const wish = async () => {
    setBusy(true);
    try { await post('/ai/wish'); await refreshMe(); haptic('success'); toast('Записали! Сообщим в боте, когда ИИ заработает'); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <div className="panel stack" style={{ padding: compact ? 12 : 16 }}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: compact ? 24 : 34 }} aria-hidden="true">🤖</span>
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: compact ? 16 : 19 }}>ИИ-сметчик — скоро</div>
          <div className="small muted">Перескажете заказ голосом или текстом — ИИ уточнит детали и соберёт черновик сметы по вашим ценам. Подключим в тарифах «Про» и «Бригада» без доплаты, как только наберётся достаточно желающих.</div>
        </div>
      </div>
      {me.aiWish
        ? <div className="badge ok" style={{ alignSelf: 'flex-start' }}>✓ Вы в списке ожидания</div>
        : <button className="btn primary block" disabled={busy} onClick={wish}>🙋 Жду ИИ</button>}
      {stat && <div className="xs muted">Для вас (админ): ждут {stat.total} чел., из них с подпиской — {stat.paying}.</div>}
      {!compact && <p className="xs muted" style={{ margin: 0 }}>А пока: сметы из шаблонов, мастера и калькуляторы, проектировщик 3D — всё работает без ИИ.</p>}
    </div>
  );
}
