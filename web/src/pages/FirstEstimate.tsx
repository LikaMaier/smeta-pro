import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, patch, post } from '../api';
import { useMe } from '../App';
import { Icon, useLoad, useToast } from '../components/ui';
import { rub0, n } from '../format';
import { haptic, tg } from '../tg';
import {
  JOB_GROUPS, getJob, jobsFor, jobDefaults, jobLines, jobTotals, jobSections, clampSize, fmtNum,
  type FirstJob, type JobLine, type SizeField,
} from '../../../shared/firstJobs';
import { TIER_LABEL, type Tier } from '../../../shared/materialTiers';
import { tradeOf } from '../../../shared/trades';
import { PRICES } from '../../../shared/plans';
import { normName } from '../../../shared/names';

type Step = 'job' | 'size' | 'result' | 'done';
const TIERS: Tier[] = ['eco', 'std', 'prem'];
/** шаги для полоски прогресса: первый уже пройден — человек вошёл (эффект «начатого дела») */
const STEPS = ['Вход', 'Работа', 'Размер', 'Смета'];

/** Отметка шага мастера — для воронки (только счётчик, без данных) */
const ev = (e: string, job?: string) => post('/ev', { e, ...(job ? { job } : {}) }).catch(() => {});

/**
 * «Первая смета за 3 шага» — для того, кто пришёл впервые:
 * что делаем (4–6 больших плиток) → размер (цифры уже стоят) → готовая смета → PDF в чат и пересылка заказчику.
 * Один вопрос на экран, крупные кнопки, без терминов. Тариф предлагается только после того, как смета готова.
 */
export default function FirstEstimate({ onSkip }: { onSkip?: () => void }) {
  const { me, refreshMe } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useState(() => new URLSearchParams(location.search));
  const urlTrade = tradeOf(sp.get('t'))?.id || null;
  const trade = urlTrade || me.trade || null;
  const first = getJob(sp.get('job'));

  const [step, setStep] = useState<Step>(first ? 'size' : 'job');
  const [job, setJob] = useState<FirstJob | null>(first);
  const [raw, setRaw] = useState<Record<string, string>>(() => (first ? asText(first) : {}));
  const [opts, setOpts] = useState<Record<string, boolean>>(() => (first ? jobDefaults(first).opts : {}));
  const [tier, setTier] = useState<Tier>('std');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ id: string; sig: string; title: string; total: number } | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    ev('fw_open');
    // специальность из кнопки бота — запоминаем, чтобы в следующий раз показать нужные работы
    if (urlTrade && urlTrade !== me.trade) patch('/me', { trade: urlTrade }).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  // свои цены из справочника важнее расчётных — те же, что сервер поставит в смету (итог на экране = итог в PDF)
  const items = useLoad(() => get<any[]>('/items').catch(() => []), []);
  const own = useMemo(() => new Map((Array.isArray(items.data) ? items.data : []).filter((i: any) => i.active !== false && Number(i.price) > 0).map((i: any) => [normName(i.name), Number(i.price)])), [items.data]);
  const sizes = useMemo(() => (job ? Object.fromEntries(job.size.map((f) => [f.key, clampSize(f, raw[f.key])])) : {}), [job, raw]);
  const byTier = useMemo(() => {
    const out = {} as Record<Tier, JobLine[]>;
    for (const t of TIERS) {
      try { out[t] = job ? jobLines(job, sizes, opts, t).map((l) => { const p = own.get(normName(l.name)); return p != null ? { ...l, price: p } : l; }) : []; } catch { out[t] = []; }
    }
    return out;
  }, [job, sizes, opts, own]);
  const lines = byTier[tier];
  const totals = jobTotals(lines);
  const sig = JSON.stringify([job?.id, sizes, opts, tier]);

  const pick = (j: FirstJob) => {
    setJob(j); setRaw(asText(j)); setOpts(jobDefaults(j).opts); setTier('std');
    setStep('size'); haptic('light'); ev('fw_job', j.id);
  };

  /** смета создаётся один раз; поменяли размер или класс после неудачной отправки — новая */
  const create = async (): Promise<string> => {
    if (made && made.sig === sig) return made.id;
    const e = await post('/estimates', {
      title: job!.name(sizes), wizard: job!.id,
      lines: lines.map((l) => ({
        name: l.name, qty: l.qty, unit: l.unit, price: l.price, type: l.type, category: l.category || null,
        costPrice: l.type === 'material' ? l.price : null, composition: l.composition || null, note: l.note || null, unconfirmed: l.type === 'material',
      })),
    });
    setMade({ id: e.id, sig, title: e.title, total: e.totals?.total ?? totals.total });
    refreshMe().catch(() => {});
    return e.id;
  };
  const sendPdf = async () => {
    setBusy(true);
    try {
      const id = await create();
      try { await post(`/estimates/${id}/pdf/send`); setSent(true); } catch (e: any) {
        if (e.code === 'subscription_required') throw e;
        setSent(false); // бот недоступен — откроем смету, там есть «Ссылка для заказчика»
      }
      haptic('success'); ev('fw_pdf', job!.id); setStep('done');
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(false); }
  };
  const edit = async () => {
    setBusy(true);
    try { const id = await create(); nav(`/estimates/${id}`); } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(false); }
  };
  const shareLink = async () => {
    if (!made) return;
    setBusy(true);
    try {
      const r = await post(`/estimates/${made.id}/share`);
      const text = `Смета «${made.title}» на ${rub0(made.total)}. Посмотрите и нажмите «Согласовать», если всё устраивает:`;
      const u = `https://t.me/share/url?url=${encodeURIComponent(r.url)}&text=${encodeURIComponent(text)}`;
      ev('fw_link', job?.id);
      if (tg?.openTelegramLink) tg.openTelegramLink(u); else window.open(u, '_blank');
    } catch (e: any) { if (e.code !== 'subscription_required') toast(e.message, true); } finally { setBusy(false); }
  };

  // ---------- шаг 1: что делаем ----------
  if (step === 'job' || !job) {
    const list = jobsFor(trade);
    const shown = new Set(list.map((j) => j.id));
    return (
      <div className="fw">
        <Progress at={1} />
        <h2>Что будем считать?</h2>
        <p className="lead">Нажмите на работу. Дальше — один вопрос про размер, и смета готова: работы, материалы и цены.</p>
        <div className="dir-grid">
          {list.map((j) => (
            <button key={j.id} className="dir-tile fw-job" onClick={() => pick(j)}>
              <span className="dir-ico" aria-hidden="true">{j.icon}</span>
              <span className="dir-t">{j.title}</span>
              <small>{j.text}</small>
            </button>
          ))}
        </div>
        {!all ? (
          <button className="btn block fw-other" onClick={() => setAll(true)}>Другая работа ▾</button>
        ) : (
          JOB_GROUPS.map(([g, ids]) => {
            const rest = ids.filter((id) => !shown.has(id));
            if (!rest.length) return null;
            return (
              <div key={g}>
                <div className="fw-group">{g}</div>
                <div className="list">
                  {rest.map((id) => { const j = getJob(id)!; return (
                    <button key={id} className="list-item" onClick={() => pick(j)}>
                      <span className="fw-li-ico" aria-hidden="true">{j.icon}</span>
                      <div className="grow"><div className="title">{j.title}</div><div className="xs muted">{j.text}</div></div>
                      <Icon.chevron className="chev" width={18} />
                    </button>
                  ); })}
                </div>
              </div>
            );
          })
        )}
        <Link to="/new?pick=1" className="fw-more">Нет нужной работы? Все виды работ и готовые сметы →</Link>
        {onSkip && <button className="fw-more fw-skip" onClick={() => { ev('fw_skip'); onSkip(); }}>Пропустить — открыть всё приложение</button>}
      </div>
    );
  }

  // ---------- шаг 2: размер ----------
  if (step === 'size') {
    return (
      <div className="fw">
        <Progress at={2} />
        <button className="fw-back" onClick={() => setStep('job')}>← {job.icon} {job.title}</button>
        <h2>{job.q}</h2>
        <p className="lead">Цифры уже стоят. Не знаете точно — оставьте как есть, потом поменяете.</p>
        {job.size.map((f) => <SizeInput key={f.key} f={f} value={raw[f.key] ?? ''} onChange={(v) => setRaw((x) => ({ ...x, [f.key]: v }))} />)}
        {!!job.opts?.length && (
          <>
            <div className="fw-lbl">Что входит</div>
            {job.opts.map((o) => (
              <label key={o.key} className="fw-opt">
                <input type="checkbox" checked={Boolean(opts[o.key])} onChange={(e) => setOpts((x) => ({ ...x, [o.key]: e.target.checked }))} />
                <span>{o.label}</span>
              </label>
            ))}
          </>
        )}
        <div className="fw-live" aria-live="polite">
          <span className="small muted">Примерно, работы и материалы</span>
          <b className="num">{totals.total > 0 ? rub0(totals.total) : '—'}</b>
        </div>
        <div className="fw-cta">
          <button className="btn primary block lg" disabled={!lines.length} onClick={() => { setStep('result'); haptic('success'); ev('fw_result', job.id); }}>Показать смету →</button>
        </div>
      </div>
    );
  }

  // ---------- шаг 3: смета готова ----------
  if (step === 'result') {
    const sections = jobSections(lines);
    return (
      <div className="fw">
        <Progress at={3} />
        <button className="fw-back" onClick={() => setStep('size')}>← Изменить размер</button>
        <h2>Смета готова 👍</h2>
        <div className="fw-total">
          <div className="small muted">{job.name(sizes)}</div>
          <div className="sum num">{rub0(totals.total)}</div>
          <div className="sub num">работы {rub0(totals.works)} · материалы {rub0(totals.mats)}</div>
        </div>
        <div className="fw-lbl">Материалы — какого класса?</div>
        <div className="fw-tier" role="radiogroup" aria-label="Класс материалов">
          {TIERS.map((t) => (
            <button key={t} role="radio" aria-checked={tier === t} className={tier === t ? 'on' : ''} onClick={() => { setTier(t); haptic('light'); }}>
              {TIER_LABEL[t]}<small className="num">{rub0(jobTotals(byTier[t]).total)}</small>
            </button>
          ))}
        </div>
        <div className="fw-lbl">Что внутри · {lines.length} {plural(lines.length, 'позиция', 'позиции', 'позиций')}</div>
        {sections.map((s) => <Section key={s.title} title={s.title} sum={s.sum} lines={s.lines} />)}
        <p className="fw-note">Цены — средние по рынку. В смете можно поставить свои: они запомнятся для следующих смет.</p>
        <div className="fw-cta">
          <button className="btn primary block lg" disabled={busy} onClick={sendPdf}>{busy ? 'Готовлю PDF…' : '📄 Получить PDF для заказчика'}</button>
          <div className="fw-note" style={{ marginTop: -2 }}>PDF придёт в чат с ботом — перешлёте заказчику одним нажатием</div>
          <button className="btn block" disabled={busy} onClick={edit}>✏️ Поменять цены и позиции</button>
        </div>
      </div>
    );
  }

  // ---------- готово: PDF в чате ----------
  return (
    <div className="fw fw-done">
      <Progress at={4} />
      <div className="fw-party" aria-hidden="true">🎉</div>
      <h2>{sent ? 'PDF уже в чате с ботом' : 'Смета сохранена'}</h2>
      <p className="lead">Смета «{made?.title}» на <b className="num">{rub0(made?.total)}</b>.<br />
        {sent ? 'Закройте приложение, нажмите на файл в чате → «Переслать» → выберите заказчика.' : 'Отправьте её заказчику ссылкой — он откроет без Telegram.'}</p>
      {sent && <button className="btn primary block lg" onClick={() => (tg?.close ? tg.close() : nav(`/estimates/${made!.id}`))}>💬 Открыть чат с PDF</button>}
      <button className={`btn block${sent ? '' : ' primary lg'}`} disabled={busy} onClick={shareLink}>🔗 Отправить ссылкой — заказчик согласует одной кнопкой</button>
      <button className="btn block" onClick={() => nav(`/estimates/${made!.id}`)}>✏️ Открыть смету: заказчик, цены, договор</button>
      <Offer onGo={() => { ev('fw_offer', job.id); nav('/settings'); }} />
      <button className="fw-more" onClick={() => { setStep('job'); setMade(null); setSent(false); }}>+ Посчитать ещё одну работу</button>
    </div>
  );
}

const asText = (j: FirstJob) => Object.fromEntries(Object.entries(jobDefaults(j).sizes).map(([k, v]) => [k, fmtNum(v)]));
const plural = (k: number, one: string, few: string, many: string) => {
  const a = k % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};

function Progress({ at }: { at: number }) {
  return (
    <div className="fw-prog" aria-label={at > 3 ? 'Готово' : `Шаг ${at} из 3`}>
      {STEPS.map((s, i) => (
        <div key={s} className={i < at ? 'done' : i === at ? 'cur' : ''}>
          <i />
          <span>{i < at ? '✓ ' : ''}{s}</span>
        </div>
      ))}
    </div>
  );
}

/** Размер: большие − / + , ввод с клавиатуры и готовые значения */
function SizeInput({ f, value, onChange }: { f: SizeField; value: string; onChange: (v: string) => void }) {
  const cur = clampSize(f, value);
  const by = (d: number) => { onChange(fmtNum(clampSize(f, Math.round((cur + d * f.step) / f.step) * f.step))); haptic('light'); };
  return (
    <div className="fw-size">
      <div className="fw-lbl">{f.label}</div>
      <div className="fw-num">
        <button type="button" aria-label={`Меньше: ${f.label}`} disabled={cur <= f.min} onClick={() => by(-1)}>−</button>
        <div className="val">
          <input inputMode="decimal" value={value} aria-label={`${f.label}, ${f.unit}`}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => onChange(fmtNum(clampSize(f, value)))} />
          <span className="u">{f.unit}</span>
        </div>
        <button type="button" aria-label={`Больше: ${f.label}`} disabled={cur >= f.max} onClick={() => by(1)}>+</button>
      </div>
      {f.presets && (
        <div className="fw-chips">
          {f.presets.map((p) => <button key={p} type="button" className={cur === p ? 'on' : ''} onClick={() => onChange(fmtNum(p))}>{fmtNum(p)} {f.unit}</button>)}
        </div>
      )}
      {f.hint && <div className="xs muted">{f.hint}</div>}
    </div>
  );
}

function Section({ title, sum, lines }: { title: string; sum: number; lines: JobLine[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fw-sec">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? '▾' : '▸'} {title}</span>
        <b className="num">{rub0(sum)}</b>
      </button>
      {open && (
        <ul>
          {lines.map((l, i) => (
            <li key={i}><span>{l.name} · {n(l.qty)} {l.unit}</span><span className="num">{rub0(l.qty * l.price)}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Предложение тарифа — только после готовой сметы, честно: что будет дальше и сколько стоит */
function Offer({ onGo }: { onGo: () => void }) {
  const { me } = useMe();
  const a = me.access;
  if (['subscription', 'team', 'admin'].includes(a.mode)) return null;
  const hours = Math.max(1, Math.round((new Date(a.until).getTime() - Date.now()) / 3600e3));
  const left = a.mode === 'trial' ? (hours <= 36 ? `ещё ${hours} ${plural(hours, 'час', 'часа', 'часов')}` : `ещё ${a.daysLeft} дн.`) : '';
  return (
    <div className="fw-offer">
      {a.mode === 'trial' ? (
        <>
          <b>Сейчас открыто всё — {left}</b>
          <p>PDF без пометки, договор, акты. Потом бесплатно — {a.freeLimit && a.freeLimit < 1000 ? a.freeLimit : 3} сметы в месяц с пометкой «Сделано в СМЕТА PRO».</p>
          <p>Без пометки, с вашим логотипом и без лимита — «Лайт»: <b>первый месяц {PRICES.liteFirst} ₽</b>, дальше {PRICES.lite} ₽. Без автосписаний.</p>
          <button className="btn block" onClick={onGo}>Посмотреть тарифы</button>
          {me.igBonus && !me.igBonus.done && <p className="xs muted" style={{ margin: '8px 0 0' }}>🎁 Или +{me.igBonus.days} дней бесплатно за подписку на наш Instagram — код на главной.</p>}
        </>
      ) : (
        <>
          <b>В PDF стоит пометка «Сделано в СМЕТА PRO»</b>
          <p>Убрать её, добавить ваш логотип и делать сметы без лимита — «Лайт»: <b>первый месяц {PRICES.liteFirst} ₽</b>, дальше {PRICES.lite} ₽. Без автосписаний.</p>
          <button className="btn primary block" onClick={onGo}>Убрать пометку — {PRICES.liteFirst} ₽</button>
        </>
      )}
    </div>
  );
}
