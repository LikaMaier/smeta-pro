/**
 * Тендеры и закупки: агент по расписанию находит свежие закупки и кладёт tenders/<ГГГГ-ММ-ДД>.json в репозиторий.
 * После деплоя сервер присылает подборку владелице в бот (каждую закупку — один раз, повторы по ссылке отсекаются).
 * Формат файла: { date, items: [{ title, cat, region, customer, price, deadline, url, source, why }] }
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bot } from 'grammy';
import { prisma } from './util';
import { reportTo } from './stats';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tenders');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const claim = async (key: string) => { try { await prisma.appKV.create({ data: { key, value: '1' } }); return true; } catch { return false; } };
const h = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

export interface Tender { title: string; cat?: string; region?: string; customer?: string; price?: number | string | null; deadline?: string; url: string; source?: string; why?: string }

const money = (p: Tender['price']) => (p == null || p === '' ? 'цена не указана' : typeof p === 'number' ? p.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽' : String(p));

/** Подборка закупок → блоки сообщений не длиннее лимита Telegram */
export function formatTenders(date: string, items: Tender[]): string[] {
  const groups = new Map<string, Tender[]>();
  for (const it of items) { const c = it.cat || 'Другое'; groups.set(c, [...(groups.get(c) || []), it]); }
  const blocks: string[] = [];
  let n = 0;
  for (const [cat, list] of groups) {
    blocks.push(`\n<b>${esc(cat)}</b>`);
    for (const it of list) {
      n++;
      blocks.push(`${n}. <a href="${esc(it.url)}">${esc(it.title).slice(0, 220)}</a>\n💰 ${esc(money(it.price))}${it.deadline ? ` · ⏳ до ${esc(it.deadline)}` : ''}\n📍 ${esc(it.region || '—')}${it.customer ? ` · ${esc(it.customer).slice(0, 90)}` : ''}${it.why ? `\n💡 ${esc(it.why).slice(0, 200)}` : ''}`);
    }
  }
  const head = `📋 <b>Тендеры и закупки на ${esc(date)}</b> — ${items.length} шт.\nРазберём вместе: перешлите нужную в чат с Claude.`;
  const out: string[] = []; let cur = head;
  for (const b of blocks) { if ((cur + '\n' + b).length > 3800) { out.push(cur); cur = b; } else cur += '\n' + b; }
  out.push(cur);
  return out;
}

async function sendNew(bot: Bot, log: any) {
  if (!fs.existsSync(DIR)) return;
  for (const f of fs.readdirSync(DIR).filter((x) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(x)).sort()) {
    if (!(await claim(`tn:file:${f}`))) continue;
    let data: { date?: string; note?: string; items?: Tender[] };
    try { data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { log.error({ err: e }, `tenders: битый файл ${f}`); continue; }
    const fresh: Tender[] = [];
    for (const it of data.items || []) if (it?.url && it?.title && (await claim(`tn:u:${h(it.url)}`))) fresh.push(it);
    const date = data.date || f.slice(0, 10);
    const msgs = fresh.length ? formatTenders(date, fresh) : [`📋 Тендеры на ${esc(date)}: новых подходящих закупок не нашлось.`];
    if (data.note) msgs[msgs.length - 1] += `\n\n<i>${esc(data.note)}</i>`;
    for (const id of reportTo()) for (const m of msgs)
      await bot.api.sendMessage(Number(id), m, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).catch((e: any) => log.error({ err: e }, 'tenders send'));
  }
}

export function startTenders(bot: Bot, log: { error: (o: any, m?: string) => void }) {
  const tick = () => sendNew(bot, log).catch((e) => log.error({ err: e }, 'tenders'));
  setTimeout(tick, 30000);
  setInterval(tick, 15 * 60e3);
}
