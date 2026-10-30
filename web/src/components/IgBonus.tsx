import React from 'react';
import { useMe } from '../App';
import { tg, haptic } from '../tg';
import { useToast } from './ui';

/** Карточка «+12 дней за подписку на Instagram»: личный код и кнопка открыть аккаунт */
export default function IgBonus() {
  const me = useMe();
  const toast = useToast();
  const b = me.igBonus;
  if (!b || b.done || !b.code) return null;
  const open = () => { if (tg?.openLink) tg.openLink(b.url); else window.open(b.url, '_blank', 'noopener'); };
  const copy = async () => { try { await navigator.clipboard.writeText(b.code!); haptic('success'); toast('Код скопирован — вставьте в комментарий'); } catch { toast(b.code!); } };
  return (
    <div className="panel igb">
      <div className="igb-t">🎁 +{b.days} дней «Про» бесплатно</div>
      <div className="small">1. Подпишитесь на <b>@{b.ig}</b> в Instagram<br />2. Под любым роликом напишите комментарий с кодом:</div>
      <button className="igb-code" onClick={copy} aria-label="Скопировать код">{b.code} <span className="xs">копировать</span></button>
      <div className="xs muted">Бонус начислится сам в течение 10 минут — бот пришлёт подтверждение.</div>
      <button className="btn primary block" onClick={open} style={{ marginTop: 8 }}>📸 Открыть Instagram</button>
    </div>
  );
}
