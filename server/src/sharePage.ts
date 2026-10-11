/** HTML страницы сметы для заказчика (без зависимостей от базы — тестируется отдельно) */
export const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const money = (v: number) => {
  const r = Math.round((v || 0) * 100) / 100;
  const frac = Math.abs(r % 1) > 0.0001;
  return `${r.toLocaleString('ru-RU', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })} ₽`;
};
const qty = (v: number) => String(Math.round((v || 0) * 1000) / 1000).replace('.', ',');

export interface PageMeta {
  token: string; number: number; hasLogo: boolean; approvedAt: Date | null; title: string; customer?: string | null; address?: string | null;
  date: Date; validDays: number; paymentTerms?: string | null; notes?: string | null; botUrl: string;
}

/** Страница сметы для заказчика. d — данные как для PDF (без себестоимости и прибыли) */
export function estimatePage(d: any, m: PageMeta) {
  const t = d.totals;
  const { token, number, hasLogo } = m;
  const e = m;
  const groups: [string | null, any[]][] = [];
  for (const l of d.lines) {
    const key = d.grouped ? (l.category || 'Прочее') : null;
    const g = groups.find((x) => x[0] === key);
    if (g) g[1].push(l); else groups.push([key, [l]]);
  }
  const date = new Date(e.date);
  const validTo = new Date(date.getTime() + (e.validDays ?? 14) * 864e5);
  const rows = groups.map(([cat, items]) => `
    ${cat ? `<div class="cat"><span>${esc(cat)}</span><b>${money(items.reduce((s: number, i: any) => s + i.amount, 0))}</b></div>` : ''}
    ${items.map((l: any) => `<div class="line"><div class="ln"><div>${esc(l.name)}${l.composition?.length ? ', в составе:' : ''}</div>${l.composition?.length ? `<ul>${l.composition.map((c: string) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${l.note ? `<small>${esc(l.note)}</small>` : ''}<small>${qty(l.qty)} ${esc(l.unit)} × ${money(l.price)}${d.split && l.unitMat && l.unitWork ? ` (работа ${money(l.unitWork)} + материал ${money(l.unitMat)})` : ''}</small></div><b>${money(l.amount)}</b></div>`).join('')}
  `).join('');
  const sum = (label: string, v: number, neg = false) => (v ? `<div class="sum"><span>${label}</span><span>${neg ? '−' : ''}${money(v)}</span></div>` : '');
  const approved = e.approvedAt ? new Date(e.approvedAt) : null;
  const bot = m.botUrl;
  const body = `
  <div class="card head">
    ${hasLogo ? `<img class="logo" src="/s/${token}/logo" alt="">` : ''}
    <div><div class="company">${esc(d.company)}</div>${d.contacts ? `<div class="muted small pre">${esc(d.contacts)}</div>` : ''}</div>
  </div>
  <div class="card">
    <div class="muted small">Смета № ${number} от ${date.toLocaleDateString('ru-RU')} · действительна до ${validTo.toLocaleDateString('ru-RU')}</div>
    <h1>${esc(e.title)}</h1>
    ${e.customer ? `<div class="kv"><span>Заказчик</span><b>${esc(e.customer)}</b></div>` : ''}
    ${e.address ? `<div class="kv"><span>Адрес</span><b>${esc(e.address)}</b></div>` : ''}
    <div class="total">${money(t.total)}</div>
    <div class="muted small">итого к оплате</div>
  </div>
  <div class="card">${rows}
    <div class="sums">
      ${sum('Работы', t.works)}${sum('Материалы', t.materials)}${sum('Техника, услуги и прочее', t.other)}
      ${sum('Накладные и непредвиденные расходы', t.overhead)}${sum('Доставка', t.delivery)}${sum('Дополнительные расходы', t.extraCosts)}
      ${sum(`Скидка ${t.discountPct}%`, t.discount, true)}${sum(`Налог ${t.taxPct}%`, t.tax)}${t.roundAdjust ? `<div class="sum"><span>Округление</span><span>${money(t.roundAdjust)}</span></div>` : ''}
      <div class="sum grand"><span>Итого</span><span>${money(t.total)}</span></div>
      ${d.paid ? `<div class="sum"><span>Получено</span><span>${money(d.paid)}</span></div><div class="sum grand2"><span>Всего к оплате</span><span>${money(d.toPay)}</span></div>` : ''}
    </div>
  </div>
  ${d.stages?.length ? `<div class="card"><h2>График оплаты</h2>${d.stages.map((x: any) => `<div class="sum"><span>${esc(x.title)} · ${x.pct}%</span><span>${money(x.amount)}${x.status === 'paid' ? ' ✓' : ''}</span></div>`).join('')}</div>` : ''}
  ${e.paymentTerms ? `<div class="card"><h2>Условия оплаты</h2><p class="pre">${esc(e.paymentTerms)}</p></div>` : ''}
  ${e.notes ? `<div class="card"><h2>Примечания</h2><p class="pre">${esc(e.notes)}</p></div>` : ''}
  <div class="card" id="act">
    ${approved
      ? `<div class="ok">✓ Смета согласована ${approved.toLocaleDateString('ru-RU')}</div><p class="muted small">Исполнитель получил уведомление и свяжется с вами.</p>`
      : `<h2>Всё устраивает?</h2>
         <input id="name" class="in" placeholder="Ваше имя (необязательно)" maxlength="120">
         <button class="btn main" id="ok">Согласовать смету</button>
         <p class="muted small">Исполнитель сразу получит уведомление в Telegram.</p>`}
    <details ${approved ? '' : ''}><summary>Есть вопрос или замечание</summary>
      <textarea id="q" class="in" rows="4" maxlength="1000" placeholder="Например: можно ли заменить бетон М300 на М250?"></textarea>
      <button class="btn" id="send">Отправить исполнителю</button>
    </details>
    <a class="btn" href="/s/${token}/pdf" target="_blank" rel="noopener">Скачать PDF</a>
    <div id="msg" class="msg" role="status"></div>
  </div>
  <div class="foot">Смета подготовлена в ${bot ? `<a href="${bot}">СМЕТА PRO</a>` : 'СМЕТА PRO'} — сметы и учёт объектов для строителей в Telegram</div>
  <script>
    const msg = (t, bad) => { const m = document.getElementById('msg'); m.textContent = t; m.className = 'msg ' + (bad ? 'bad' : 'good'); };
    const call = async (path, body) => {
      const r = await fetch('/s/${token}/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Не получилось, попробуйте ещё раз');
      return d;
    };
    const ok = document.getElementById('ok');
    if (ok) ok.onclick = async () => {
      if (!confirm('Согласовать смету на ${money(t.total)}?')) return;
      ok.disabled = true;
      try { await call('approve', { name: document.getElementById('name').value || undefined }); location.reload(); }
      catch (e) { msg(e.message, true); ok.disabled = false; }
    };
    const send = document.getElementById('send');
    send.onclick = async () => {
      const q = document.getElementById('q');
      if (!q.value.trim()) return msg('Напишите вопрос', true);
      send.disabled = true;
      try { await call('comment', { text: q.value, name: (document.getElementById('name') || {}).value || undefined }); q.value = ''; msg('Отправлено. Исполнитель ответит вам.'); }
      catch (e) { msg(e.message, true); } finally { send.disabled = false; }
    };
  </script>`;
  return page(`${e.title} — смета`, body);
}

export function page(title: string, body: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f4f1ea;--card:#fff;--ink:#22180f;--muted:#6f604f;--line:#eadfcb;--accent:#e8a028;--accent-text:#9a5b06;--accent-ink:#2b1a0e;--ok:#2e7d4f;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#15181d;--card:#1e232a;--ink:#f1ece4;--muted:#a49a8c;--line:#2f3540;--accent:#f0b03a;--accent-text:#f0b03a;--accent-ink:#1a1206;--ok:#5fbf86;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:12px}
.head{display:flex;gap:14px;align-items:center}.logo{max-width:72px;max-height:56px;object-fit:contain}
.company{font-weight:700;font-size:18px}h1{font-size:22px;margin:6px 0 10px;line-height:1.2}h2{font-size:17px;margin:0 0 10px}
.muted{color:var(--muted)}.small{font-size:13px}.pre{white-space:pre-wrap;margin:0}
.kv{display:flex;gap:10px;font-size:15px;margin:2px 0}.kv span{color:var(--muted);min-width:78px}
.total{font-size:32px;font-weight:800;margin-top:12px;color:var(--accent-text)}
.cat{display:flex;justify-content:space-between;gap:10px;font-weight:700;color:var(--accent-text);margin:14px 0 4px;font-size:15px}
.cat:first-child{margin-top:0}
.line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.line b{white-space:nowrap}.ln small{display:block;color:var(--muted);font-size:13px}
.sums{margin-top:12px}.sum{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:15px}.sum span:last-child{white-space:nowrap}
.ln ul{margin:4px 0 2px;padding-left:18px;font-size:14px;color:var(--muted)}.sum.grand2{font-weight:800;font-size:17px}
.sum.grand{font-weight:800;font-size:19px;border-top:2px solid var(--accent);margin-top:8px;padding-top:10px}
.btn{display:block;width:100%;text-align:center;padding:14px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-weight:600;margin-top:10px;text-decoration:none;cursor:pointer}
.btn.main{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-size:17px}
.btn:disabled{opacity:.6}
.in{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;margin-top:6px}
details{margin-top:12px}summary{cursor:pointer;color:var(--muted);padding:6px 0}
.ok{color:var(--ok);font-weight:800;font-size:19px}
.msg{margin-top:10px;font-size:14px}.msg.good{color:var(--ok)}.msg.bad{color:var(--bad)}
.foot{text-align:center;color:var(--muted);font-size:12px;padding:8px 0 24px}.foot a{color:var(--accent-text)}
</style></head><body><main>${body}</main></body></html>`;
}
