import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { useMe } from '../App';
import { Fold, Icon, SearchBox, useLoad, useToast } from '../components/ui';
import { rub0 } from '../format';
import { DIRECTIONS, getDirection, searchKinds, type WorkKind } from '../../../shared/directions';
import { TEMPLATES, TEMPLATE_GROUPS } from '../../../shared/templates';
import { ImportButton } from './Estimates';
import QuickEstimate from '../components/QuickEstimate';

const DIR_KEY = 'smeta_dir';
const readDir = () => { try { return localStorage.getItem(DIR_KEY); } catch { return null; } };

/**
 * «Новая смета»: сверху — «Опишите работу» (текст → готовые строки), ниже — направление → вид работы.
 * Направление запоминается: в следующий раз сразу виды работ, сменить — одной кнопкой.
 * «Другое» — пустая смета с поиском по справочнику и своими строками.
 */
export default function NewEstimate() {
  const nav = useNavigate();
  const toast = useToast();
  const { me } = useMe();
  // ?dir=roof — из бота («Чем занимаетесь?»): сразу нужное направление
  const [dirId, setDirId] = useState<string | null>(() => {
    const sp = new URLSearchParams(location.search);
    const d = sp.get('dir');
    if (d && getDirection(d)) { try { localStorage.setItem(DIR_KEY, d); } catch { /* */ } return d; }
    return sp.get('pick') ? null : readDir();
  });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const dir = getDirection(dirId);
  const qs = q.trim().toLowerCase();
  const found = qs.length < 2 ? [] : searchKinds(qs);
  const recent = useLoad(() => get<any[]>('/estimates').catch(() => []), []);
  const mine = useLoad(() => get<any[]>('/estimates', { template: '1' }).catch(() => []), []);
  const last = (recent.data || []).find((e: any) => !e.isTemplate);
  const canCreate = me.access.active || me.access.freeEstimateLeft;

  const choose = (id: string | null) => {
    setDirId(id);
    try { id ? localStorage.setItem(DIR_KEY, id) : localStorage.removeItem(DIR_KEY); } catch { /* */ }
    window.scrollTo(0, 0);
  };
  const create = async (body: any, suffix = '') => {
    if (!canCreate) { nav('/settings'); return; }
    setBusy(true);
    try { const e = await post('/estimates', body); nav(`/estimates/${e.id}${suffix}`); }
    catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); }
    finally { setBusy(false); }
  };
  const openKind = (k: WorkKind) => (k.template ? create({ templateId: k.template }) : nav(k.to!));
  const own = () => create({ title: dir ? `${dir.title}: смета` : 'Новая смета' }, '?add=1');

  // ---------- шаг 1: направление ----------
  if (!dir) {
    return (
      <>
        <QuickEstimate onBusy={setBusy} />
        <div className="home-sec" style={{ margin: '18px 0 6px' }}>Или выберите направление</div>
        <p className="xs muted" style={{ marginTop: 0 }}>Дальше вид работы, 2–3 вопроса — и готовая смета с ценами.</p>
        <SearchBox value={q} onChange={setQ} placeholder="Или найдите: септик, стяжка, кровля…" />
        {qs.length >= 2 && (
          <div className="list" style={{ marginBottom: 12 }}>
            {found.map(({ d, k }) => (
              <button key={k.id} className="list-item" disabled={busy} onClick={() => { try { localStorage.setItem(DIR_KEY, d.id); } catch { /* */ } openKind(k); }}>
                <span style={{ fontSize: 22, width: 30, textAlign: 'center', flex: 'none' }} aria-hidden="true">{k.icon || d.icon}</span>
                <div className="grow"><div className="title">{k.title}</div><div className="xs muted">{d.title}</div></div>
                <Icon.chevron className="chev" width={18} />
              </button>
            ))}
            {!found.length && <button className="list-item" onClick={own}><div className="grow"><div className="title">Не нашли? Составьте сами</div><div className="xs muted">Пустая смета с поиском по справочнику</div></div><Icon.chevron className="chev" width={18} /></button>}
          </div>
        )}
        <div className="dir-grid">
          {DIRECTIONS.map((d) => (
            <button key={d.id} className="dir-tile" onClick={() => choose(d.id)}>
              <span className="dir-ico" aria-hidden="true">{d.icon}</span>
              <span className="dir-t">{d.title}</span>
              <small>{d.text}</small>
            </button>
          ))}
          <button className="dir-tile other" onClick={own} disabled={busy}>
            <span className="dir-ico" aria-hidden="true">✏️</span>
            <span className="dir-t">Другое</span>
            <small>Составлю сам: свои работы и цены</small>
          </button>
        </div>
        {last && (
          <button className="list-item panel" style={{ marginTop: 12 }} disabled={busy} onClick={() => create({ fromId: last.id })}>
            <span style={{ fontSize: 22, width: 30, textAlign: 'center', flex: 'none' }} aria-hidden="true">↻</span>
            <div className="grow"><div className="title">Повторить прошлую смету</div><div className="xs muted ellipsis">{last.title} · {rub0(last.total)}</div></div>
            <Icon.chevron className="chev" width={18} />
          </button>
        )}
        <More busy={busy} create={create} mine={mine.data || []} />
      </>
    );
  }

  // ---------- шаг 2: вид работы ----------
  return (
    <>
      <div className="row between" style={{ marginBottom: 6 }}>
        <button className="linklike small" onClick={() => choose(null)}>← Все направления</button>
        <button className="linklike small" onClick={() => choose(null)}>✍️ Описать словами</button>
      </div>
      <div className="dir-head"><span aria-hidden="true">{dir.icon}</span>{dir.title}</div>
      <p className="muted" style={{ marginTop: 0 }}>Что делаем? Ответьте на 2–3 вопроса — работы и материалы посчитаются сами, материалы можно взять эконом, стандарт или премиум.</p>
      <div className="list">
        {dir.kinds.map((k) => (
          <button key={k.id} className="list-item" disabled={busy} onClick={() => openKind(k)}>
            {k.icon && <span style={{ fontSize: 22, width: 30, textAlign: 'center', flex: 'none' }} aria-hidden="true">{k.icon}</span>}
            <div className="grow"><div className="title">{k.title}</div>{k.text && <div className="xs muted">{k.text}</div>}</div>
            <Icon.chevron className="chev" width={18} />
          </button>
        ))}
        <button className="list-item" disabled={busy} onClick={own}>
          <span style={{ fontSize: 22, width: 30, textAlign: 'center', flex: 'none' }} aria-hidden="true">✏️</span>
          <div className="grow"><div className="title">Другое — составлю сам</div><div className="xs muted">Пустая смета: поиск по справочнику и свои строки</div></div>
          <Icon.chevron className="chev" width={18} />
        </button>
      </div>
      {last && (
        <button className="list-item panel" style={{ marginTop: 12 }} disabled={busy} onClick={() => create({ fromId: last.id })}>
          <span style={{ fontSize: 22, width: 30, textAlign: 'center', flex: 'none' }} aria-hidden="true">↻</span>
          <div className="grow"><div className="title">Повторить прошлую смету</div><div className="xs muted ellipsis">{last.title} · {rub0(last.total)}</div></div>
          <Icon.chevron className="chev" width={18} />
        </button>
      )}
      <More busy={busy} create={create} mine={mine.data || []} />
    </>
  );
}

/** Остальные способы — свёрнуты, чтобы не отвлекать */
function More({ busy, create, mine }: { busy: boolean; create: (b: any, s?: string) => void; mine: any[] }) {
  const nav = useNavigate();
  return (
    <div style={{ marginTop: 14 }}>
      <Fold id="new-more" title="Другие способы" summary="шаблоны, Excel, ИИ">
        {mine.length > 0 && (
          <>
            <div className="xs muted" style={{ margin: '0 0 6px' }}>Мои шаблоны</div>
            <div className="list" style={{ marginBottom: 10 }}>
              {mine.map((t: any) => <button key={t.id} className="list-item" disabled={busy} onClick={() => create({ fromId: t.id })}><div className="grow"><div className="title">{t.title}</div><div className="xs muted">{t.linesCount} поз.</div></div><Icon.chevron className="chev" width={18} /></button>)}
            </div>
          </>
        )}
        <div className="xs muted" style={{ margin: '0 0 6px' }}>Готовые сметы ({TEMPLATES.length}) — количество и цены потом поправите под объект</div>
        {TEMPLATE_GROUPS.map((g) => (
          <Fold key={g} id={`tpl-${g}`} title={g} summary={`${TEMPLATES.filter((t) => t.group === g).length}`}>
            <div className="list" style={{ marginBottom: 10 }}>
              {TEMPLATES.filter((t) => t.group === g).map((t) => <button key={t.id} className="list-item" disabled={busy} onClick={() => create({ templateId: t.id })}><div className="grow"><div className="title">{t.title}</div><div className="xs muted">{t.description}</div></div><Icon.chevron className="chev" width={18} /></button>)}
            </div>
          </Fold>
        ))}
        <ImportButton onDone={(id) => nav(`/estimates/${id}`)} />
        <Link to="/assistant" className="btn block" style={{ marginTop: 8 }}>🤖 ИИ-сметчик: по голосу и тексту</Link>
      </Fold>
    </div>
  );
}
