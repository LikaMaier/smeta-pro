/**
 * Threads-агент: агент по расписанию пишет посты на день в threads/<ГГГГ-ММ-ДД>.json
 * ({ posts: [{ at: "ЧЧ:ММ", text }] }), сервер публикует их в своё время (МСК), отвечает на частые вопросы в ответах,
 * остальное пересылает владелице в бот. Подключение: /threads в боте → «Войти через Threads».
 * Переменные Railway: THREADS_APP_ID, THREADS_APP_SECRET (ID и секрет приложения из раздела Threads в панели Meta).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InlineKeyboard, type Bot } from 'grammy';
import { prisma } from './util';
import { env } from './env';
import { reportTo } from './stats';
import { autoReply, fallbackReply, isSpam, needsHuman } from '../../shared/igReplies';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../threads');
const API = 'https://graph.threads.net/v1.0';
const APP_ID = () => process.env.THREADS_APP_ID || '';
const APP_SECRET = () => process.env.THREADS_APP_SECRET || '';
const OWNER = '503303776';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kvGet = async (key: string) => (await prisma.appKV.findUnique({ where: { key } }))?.value ?? null;
const kvSet = (key: string, value: string) => prisma.appKV.upsert({ where: { key }, create: { key, value }, update: { value } });
const kvClaim = async (key: string, value = '1') => { try { await prisma.appKV.create({ data: { key, value } }); return true; } catch { return false; } };
const admins = () => [...new Set([...reportTo(), OWNER])];
const mskNow = () => new Date(Date.now() + 3 * 3600e3);
const today = () => mskNow().toISOString().slice(0, 10);

let cached: { token: string; uid: string } | null = null;
async function creds() {
  if (!cached) { const t = await kvGet('th:token'), u = await kvGet('th:userId'); if (t && u) cached = { token: t, uid: u }; }
  return cached;
}
export const thEnabled = async () => Boolean(await creds());
async function th(p: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET') {
  const c = await creds();
  const qs = new URLSearchParams({ ...params, access_token: c?.token || '' });
  const r = await fetch(method === 'GET' ? `${API}${p}?${qs}` : `${API}${p}`, method === 'POST' ? { method, body: qs } : undefined);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `Threads ${r.status}`);
  return j;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Текстовый пост или ответ: контейнер → пауза → публикация */
export async function publishText(text: string, replyTo?: string) {
  const c = await creds(); if (!c) throw new Error('Threads не подключён');
  const box = await th(`/${c.uid}/threads`, { media_type: 'TEXT', text: text.slice(0, 500), ...(replyTo ? { reply_to_id: replyTo } : {}) }, 'POST');
  await sleep(8000);
  for (let i = 0; i < 4; i++) {
    try { return (await th(`/${c.uid}/threads_publish`, { creation_id: box.id }, 'POST')).id as string; }
    catch (e) { if (i === 3) throw e; await sleep(10000); }
  }
  return '';
}

// ---------- посты на день ----------
interface Post { at: string; text: string }
function dayPosts(day = today()): Post[] {
  const f = path.join(DIR, `${day}.json`);
  if (!fs.existsSync(f)) return [];
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return (j.posts || []).filter((p: any) => /^\d{1,2}:\d{2}$/.test(p?.at) && p?.text); } catch { return []; }
}
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Утром — план на день владелице с кнопками отмены */
async function morningPlan(bot: Bot) {
  const posts = dayPosts(); if (!posts.length) return;
  if (!(await kvClaim(`th:plan:${today()}`))) return;
  const kb = new InlineKeyboard();
  posts.forEach((_, i) => { kb.text(`🚫 ${i + 1}`, `th:skip:${today()}:${i}`); if (i % 3 === 2) kb.row(); });
  const text = `🧵 <b>Threads на сегодня</b> — ${posts.length} постов, выйдут сами:\n\n` + posts.map((p, i) => `<b>${i + 1}. ${p.at}</b> — ${esc(p.text).slice(0, 220)}`).join('\n\n') + '\n\n<i>Не нравится пост — нажмите его номер, он не выйдет.</i>';
  for (const id of admins()) await bot.api.sendMessage(Number(id), text.slice(0, 4000), { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

async function publishDue(bot: Bot, log: any) {
  const now = mskNow(), cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const posts = dayPosts();
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i], due = minutes(p.at);
    if (cur < due || cur - due > 90) continue;          // опоздали больше чем на 1,5 ч — пропускаем
    const key = `th:post:${today()}:${i}`;
    if (!(await kvClaim(key, 'publishing'))) continue;   // уже опубликован или отменён
    try { const id = await publishText(p.text); await kvSet(key, `published:${id}`); }
    catch (e: any) { await kvSet(key, 'error'); log.error({ err: e }, 'threads publish'); for (const a of admins()) await bot.api.sendMessage(Number(a), `⚠️ Threads: пост ${i + 1} не вышел — ${e.message}`).catch(() => {}); }
  }
}

// ---------- ответы ----------
const FALLBACK_H = 4;
async function checkReplies(bot: Bot, log: any) {
  const c = await creds(); if (!c) return;
  const me = (await kvGet('th:username')) || '';
  const media = await th(`/${c.uid}/threads`, { fields: 'id,text,permalink,timestamp', limit: '12' });
  for (const m of media.data || []) {
    const rs = await th(`/${m.id}/replies`, { fields: 'id,text,username,timestamp' }).catch(() => ({ data: [] }));
    for (const r of rs.data || []) {
      if (!r.text || r.username === me) continue;
      if (!(await kvClaim(`th:r:${r.id}`))) continue;
      const ans = autoReply(r.text);
      if (ans) { await publishText(ans, r.id).catch((e) => log.error({ err: e }, 'threads reply')); continue; }
      const spam = isSpam(r.text), human = needsHuman(r.text);
      if (!spam && !human) await kvSet(`th:pending:${r.id}`, String(Date.now()));
      for (const a of admins()) {
        const msg = await bot.api.sendMessage(Number(a), `🧵 <b>Ответ в Threads</b> от @${esc(r.username || '?')}:\n«${esc(r.text).slice(0, 900)}»\n\n<i>${spam ? 'Похоже на спам — отвечать не буду.' : human ? '⚠️ Похоже на жалобу — лучше ответить самой.' : `Если не ответите за ${FALLBACK_H} ч, отвечу сама.`} Ответить своими словами — свайп влево по этому сообщению.</i>${m.permalink ? `\n${m.permalink}` : ''}`, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).catch(() => null);
        if (msg) await kvSet(`th:reply:${a}:${msg.message_id}`, r.id);
      }
    }
  }
  for (const p of await prisma.appKV.findMany({ where: { key: { startsWith: 'th:pending:' } } })) {
    if (Date.now() - Number(p.value) < FALLBACK_H * 3600e3) continue;
    await prisma.appKV.deleteMany({ where: { key: p.key } });
    const rid = p.key.slice('th:pending:'.length);
    await publishText(fallbackReply(rid), rid).catch((e) => log.error({ err: e }, 'threads fallback'));
  }
}

async function refreshToken(log: any) {
  const last = Number(await kvGet('th:tokenAt')) || 0;
  if (Date.now() - last < 30 * 864e5) return;
  const c = await creds(); if (!c) return;
  const r = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(c.token)}`);
  const j: any = await r.json().catch(() => ({}));
  if (j.access_token) { await kvSet('th:token', j.access_token); await kvSet('th:tokenAt', String(Date.now())); cached = null; }
  else log.error({ th: j }, 'Threads: не удалось продлить токен');
}

/** Отчёт по понедельникам и четвергам */
async function report(bot: Bot) {
  const now = mskNow();
  if (![1, 4].includes(now.getUTCDay()) || now.getUTCHours() < 10) return;
  if (!(await kvClaim(`th:week:${today()}`))) return;
  const c = await creds(); if (!c) return;
  const since = Math.floor((Date.now() - (now.getUTCDay() === 1 ? 4 : 3) * 864e5) / 1000);
  const ins = await th(`/${c.uid}/threads_insights`, { metric: 'views,likes,replies,reposts,followers_count', since: String(since), until: String(Math.floor(Date.now() / 1000)) }).catch(() => null);
  const val = (n: string) => { const m = ins?.data?.find((x: any) => x.name === n); return m?.total_value?.value ?? (m?.values || []).reduce((a: number, v: any) => a + (v.value || 0), 0) ?? '—'; };
  const text = `🧵 <b>Threads за ${now.getUTCDay() === 1 ? 4 : 3} дн.</b>\nПросмотры: <b>${val('views')}</b> · лайки: ${val('likes')} · ответы: ${val('replies')} · репосты: ${val('reposts')}\nПодписчиков: <b>${val('followers_count')}</b>`;
  for (const a of admins()) await bot.api.sendMessage(Number(a), text, { parse_mode: 'HTML' }).catch(() => {});
}

// ---------- подключение ----------
const REDIRECT = () => `${env.PUBLIC_URL}/threads/callback`;
const sign = (v: string) => crypto.createHmac('sha256', env.SESSION_SECRET || 'dev').update('th' + v).digest('base64url').slice(0, 24);
export function thConnectLink(tg: number) {
  const st = `${tg}.${Date.now() + 3600e3}`;
  return `https://threads.net/oauth/authorize?client_id=${APP_ID()}&redirect_uri=${encodeURIComponent(REDIRECT())}&scope=threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights&response_type=code&state=${encodeURIComponent(`${st}.${sign(st)}`)}`;
}
export async function thFinishConnect(code: string, state: string) {
  const [tg, exp, sig] = state.split('.');
  const fromBot = !!tg && !!exp && sign(`${tg}.${exp}`) === sig && Number(exp) > Date.now();
  if (!code) throw new Error('Threads не передал код входа — отправьте боту /threads ещё раз');
  const r1 = await fetch('https://graph.threads.net/oauth/access_token', { method: 'POST', body: new URLSearchParams({ client_id: APP_ID(), client_secret: APP_SECRET(), grant_type: 'authorization_code', redirect_uri: REDIRECT(), code: code.replace(/#_$/, '') }) });
  const j1: any = await r1.json().catch(() => ({}));
  if (!j1.access_token) throw new Error(j1.error_message || j1.error?.message || 'Threads не выдал доступ');
  const r2 = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(APP_SECRET())}&access_token=${encodeURIComponent(j1.access_token)}`);
  const j2: any = await r2.json().catch(() => ({}));
  const long = j2.access_token || j1.access_token;
  const me: any = await (await fetch(`${API}/me?fields=id,username&access_token=${encodeURIComponent(long)}`)).json().catch(() => ({}));
  const id = String(me.id || j1.user_id || '');
  if (!id) throw new Error('Не удалось узнать ID аккаунта Threads');
  await kvSet('th:token', long); await kvSet('th:userId', id); await kvSet('th:tokenAt', String(Date.now())); await kvSet('th:username', me.username || '');
  cached = null;
  return { username: String(me.username || ''), tg: fromBot ? [Number(tg)] : admins().map(Number) };
}

export function attachThreads(bot: Bot) {
  const isAdmin = (id?: number) => id != null && admins().includes(String(id));
  const connect = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply(`Эта команда только для владельца. Ваш Telegram ID: ${ctx.from?.id}`);
    if (!APP_ID() || !APP_SECRET()) return ctx.reply('Сначала добавьте в Railway переменные THREADS_APP_ID и THREADS_APP_SECRET (ID и секрет приложения из раздела Threads в панели Meta).');
    const on = await thEnabled();
    await ctx.reply(on ? `✅ Threads подключён${(await kvGet('th:username')) ? ` (@${await kvGet('th:username')})` : ''}. Переподключить:` : '🧵 Подключите Threads — нажмите кнопку, войдите и разрешите доступ:', { reply_markup: new InlineKeyboard().url('Войти через Threads', thConnectLink(ctx.from!.id)) });
  };
  bot.command(['threads', 'tr'], connect);
  bot.hears(/^\/?(тредс|треды|threads)\s*$/i, connect);
  bot.callbackQuery(/^th:skip:(\d{4}-\d{2}-\d{2}):(\d{1,2})$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery();
    const [, day, n] = ctx.match as RegExpMatchArray;
    const ok = await kvClaim(`th:post:${day}:${n}`, 'skipped');
    await ctx.answerCallbackQuery({ text: ok ? `Пост ${Number(n) + 1} не выйдет` : 'Этот пост уже опубликован' });
  });
  bot.on('message:text', async (ctx, next) => {
    const rt = ctx.message.reply_to_message;
    if (!rt || !isAdmin(ctx.from?.id)) return next();
    const rid = await kvGet(`th:reply:${ctx.from.id}:${rt.message_id}`);
    if (!rid) return next();
    try { await publishText(ctx.message.text, rid); await prisma.appKV.deleteMany({ where: { key: `th:pending:${rid}` } }); await ctx.reply('✅ Ответ отправлен в Threads'); }
    catch (e: any) { await ctx.reply(`⚠️ Не отправилось: ${e.message}`); }
  });
}

export function startThreads(bot: Bot, log: { error: (o: any, m?: string) => void; info: (m: string) => void }) {
  let running = false;
  const tick = async () => {
    if (running || !(await thEnabled())) return; running = true;
    try {
      await morningPlan(bot).catch((e) => log.error({ err: e }, 'threads plan'));
      await publishDue(bot, log).catch((e) => log.error({ err: e }, 'threads due'));
      await checkReplies(bot, log).catch((e) => log.error({ err: e }, 'threads replies'));
      await refreshToken(log).catch(() => {});
      await report(bot).catch((e) => log.error({ err: e }, 'threads report'));
    } finally { running = false; }
  };
  setTimeout(tick, 40000);
  setInterval(tick, 5 * 60e3);
  thEnabled().then((on) => log.info(`Threads-агент: ${on ? 'подключён' : 'ждёт подключения (/threads в боте)'}`));
}
