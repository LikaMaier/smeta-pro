import React, { useState } from 'react';
import { get, post, put, del } from '../api';
import { Sheet, useToast } from './ui';
import { haptic, confirmDialog, tg } from '../tg';
import { rub0 } from '../format';

/**
 * Общие действия проекта (забор, план участка): сохранить, мои проекты, PDF эскизного проекта, 3D-ссылка заказчику.
 * persist() — сохранить и вернуть id (нужно, чтобы привязать проект к смете).
 */
export function useDesignStore(kind: 'fence' | 'site' | 'mep', title: string, params: any, id0: string | null) {
  const [designId, setDesignId] = useState<string | null>(id0);
  const persist = async (): Promise<string> => {
    const body = { title, params };
    try {
      const d = designId ? await put(`/designs/${designId}`, body) : await post('/designs', { ...body, kind });
      setDesignId(d.id); return d.id;
    } catch (e: any) {
      if (e.status !== 404) throw e;
      const d = await post('/designs', { ...body, kind }); setDesignId(d.id); return d.id;
    }
  };
  return { designId, setDesignId, persist };
}

export function DesignActions({ kind, title, params, errors, total, persist, designId, setDesignId, onOpen, onEstimate }: {
  kind: 'fence' | 'site' | 'mep'; title: string; params: any; errors: string[]; total: number;
  persist: () => Promise<string>; designId: string | null; setDesignId: (v: string | null) => void;
  onOpen: (d: any) => void; onEstimate: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [share, setShare] = useState<{ url: string | null; viewedAt?: string | null } | null>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const guard = async (k: string, f: () => Promise<void>) => {
    if (errors.length) return toast(errors[0], true);
    setBusy(k);
    try { await f(); } catch (e: any) { if (e.code !== 'subscription_required' && e.code !== 'plan_required' && e.code !== 'design_required') toast(e.message, true); } finally { setBusy(''); }
  };
  const shareText = `${title}: 3D-проект, чертежи и параметры. Покрутите модель пальцем:`;
  const sendTg = () => { if (!share?.url) return; const u = `https://t.me/share/url?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(shareText)}`; if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank'); };
  const copy = async () => { if (!share?.url) return; try { await navigator.clipboard.writeText(`${shareText}\n${share.url}`); haptic('success'); toast('Скопировано — вставьте в WhatsApp, SMS или почту'); } catch { toast(share.url); } };
  const openList = async () => { setListOpen(true); setList(null); try { setList(await get('/designs', { kind })); } catch (e: any) { toast(e.message, true); setList([]); } };
  const remove = async (d: any) => {
    if (!(await confirmDialog(`Удалить проект «${d.title}»?`))) return;
    await del(`/designs/${d.id}`); setList((l) => (l || []).filter((x) => x.id !== d.id)); if (d.id === designId) setDesignId(null);
  };
  return (
    <>
      <div className="stack" style={{ marginTop: 12 }}>
        <button className="btn primary block lg" disabled={busy === 'share'} onClick={() => guard('share', async () => { const id = await persist(); setShare(await post(`/designs/${id}/share`)); haptic('success'); })}>{busy === 'share' ? 'Готовлю ссылку…' : '🧊 3D-ссылка для заказчика'}</button>
        <button className="btn block" disabled={busy === 'pdf'} onClick={() => guard('pdf', async () => { const id = await persist().catch(() => null); const r = await post('/designer/pdf/send', { title, params, ...(id ? { designId: id } : {}) }); haptic('success'); toast(r?.mode === 'draft' ? 'Черновой PDF (с водяным знаком) отправлен в чат с ботом' : 'PDF 3D-проекта отправлен в чат с ботом'); })}>{busy === 'pdf' ? 'Готовлю PDF…' : '📄 PDF 3D-проекта в Telegram'}</button>
        <div className="grid2">
          <button className="btn" disabled={busy === 'save'} onClick={() => guard('save', async () => { await persist(); haptic('success'); toast('Проект сохранён'); })}>{designId ? 'Сохранить' : 'Сохранить проект'}</button>
          <button className="btn" onClick={openList}>Мои проекты</button>
        </div>
        <button className="btn block" onClick={onEstimate}>Смета по проекту · ≈ {rub0(total)}</button>
      </div>

      <Sheet open={!!share} onClose={() => setShare(null)} title="3D для заказчика">
        <p className="small muted" style={{ marginTop: 0 }}>Заказчик откроет ссылку в любом браузере без Telegram: покрутит 3D, посмотрит чертежи и параметры. Когда откроет — придёт уведомление.</p>
        {share?.url && <input className="input" readOnly value={share.url} onFocus={(e) => e.target.select()} />}
        {share?.viewedAt && <p className="xs muted">Заказчик открывал: {new Date(share.viewedAt).toLocaleString('ru-RU')}</p>}
        <div className="stack" style={{ marginTop: 10 }}>
          <button className="btn primary block" onClick={sendTg}>Отправить в Telegram</button>
          <button className="btn block" onClick={copy}>Скопировать для WhatsApp / SMS</button>
          {share?.url && <a className="btn block" href={share.url} target="_blank" rel="noreferrer">Открыть как заказчик</a>}
          <button className="btn block" onClick={async () => { if (!designId) return; setShare(null); await del(`/designs/${designId}/share`); toast('Ссылка отключена'); }}>Отключить ссылку</button>
        </div>
      </Sheet>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Мои проекты">
        {list == null ? <p className="muted">Загрузка…</p> : !list.length ? <p className="muted">Сохранённых проектов пока нет.</p> : (
          <div className="list">
            {list.map((d) => (
              <div key={d.id} className="list-item">
                <button className="grow linklike" style={{ textAlign: 'left', textDecoration: 'none', color: 'inherit' }} onClick={() => { onOpen(d); setListOpen(false); }}>
                  <div className="title">{d.title}</div>
                  <div className="xs muted">{d.params?.L}×{d.params?.W} м · {new Date(d.updatedAt).toLocaleDateString('ru-RU')}</div>
                </button>
                <button className="btn sm" onClick={() => remove(d)} aria-label="Удалить">✕</button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Таблица металла (профиль, назначение, длина, хлысты, масса) */
export function SteelTable({ steel }: { steel: any[] }) {
  if (!steel.length) return <p className="small muted">Металла в проекте нет.</p>;
  return (
    <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="dz-table">
        <thead><tr><th>Профиль</th><th>Назначение</th><th>Длина, м</th><th>Хлыстов</th><th>Масса, кг</th></tr></thead>
        <tbody>
          {steel.map((s) => <tr key={s.profile}><td><b>{s.profile}</b></td><td>{s.use}</td><td className="num">{s.length}</td><td className="num">{s.bars} × {s.stock} м</td><td className="num">{s.kgNet}</td></tr>)}
          <tr><td colSpan={2}><b>Итого</b></td><td className="num">{Math.round(steel.reduce((a, s) => a + s.length, 0) * 10) / 10}</td><td className="num">{steel.reduce((a, s) => a + s.bars, 0)}</td><td className="num"><b>{steel.reduce((a, s) => a + s.kgNet, 0)}</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}
