/**
 * Instagram-агент: очередь роликов → одобрение в боте → публикация Reels, ответы на комментарии, отчёт.
 *
 * Ролики готовит агент по расписанию: кладёт mp4 в marketing/media и описание в marketing/queue/<id>.json
 * ({ id, video, caption }) и пушит в репозиторий. После деплоя сервер находит новые ролики и присылает
 * администратору в бот. Автопубликация (по умолчанию): ролик выходит сам в 19:00 МСК, кнопка «Не публиковать» отменяет.
 * Комментарии: частые вопросы — готовый ответ; остальное — владелице, без ответа за 4 ч — вежливый общий ответ.
 * Токен: IG_TOKEN (Instagram API со входом через Instagram), IG_USER_ID. Токен продлевается сам раз в 30 дней.
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
import { codeIn, grantByCode, IG_BONUS_DAYS } from './igBonus';
export { autoReply };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../marketing');
export const MEDIA_DIR = path.join(ROOT, 'media');
const QUEUE_DIR = path.join(ROOT, 'queue');
const API = 'https://graph.instagram.com/v21.0';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- хранение состояния (AppKV) ----------
const kvGet = async (key: string) => (await prisma.appKV.findUnique({ where: { key } }))?.value ?? null;
const kvSet = (key: string, value: string) => prisma.appKV.upsert({ where: { key }, create: { key, value }, update: { value } });
/** Захват ключа один раз (если двух копий сервера — сработает только у одной) */
const kvClaim = async (key: string, value: string) => { try { await prisma.appKV.create({ data: { key, value } }); return true; } catch { return false; } };

// подключение: токен и ID аккаунта из «входа через Instagram» (кнопка в боте) или из переменных Railway
let cached: { token: string; userId: string } | null = null;
async function creds() {
  if (!cached) {
    const t = (await kvGet('ig:token')) || env.IG_TOKEN, u = (await kvGet('ig:userId')) || env.IG_USER_ID;
    if (t && u) cached = { token: t, userId: u };
  }
  return cached;
}
export const igEnabled = async () => Boolean(await creds());
async function token() { return (await creds())?.token || ''; }
async function uid() { return (await creds())?.userId || ''; }

async function ig(pathname: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET') {
  const qs = new URLSearchParams({ ...params, access_token: await token() });
  const r = await fetch(method === 'GET' ? `${API}${pathname}?${qs}` : `${API}${pathname}`, method === 'POST' ? { method, body: qs } : undefined);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram ${r.status}`);
  return j;
}

/** Продление токена (живёт 60 дней) — раз в 30 дней */
async function refreshToken(log: any) {
  const last = Number(await kvGet('ig:tokenAt')) || 0;
  if (Date.now() - last < 30 * 864e5) return;
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(await token())}`);
  const j: any = await r.json().catch(() => ({}));
  if (j.access_token) { await kvSet('ig:token', j.access_token); cached = null; await kvSet('ig:tokenAt', String(Date.now())); log.info('Instagram: токен продлён'); }
  else log.error({ ig: j }, 'Instagram: не удалось продлить токен');
}

// ---------- очередь роликов ----------
interface Item { id: string; video: string; caption: string; title?: string }
function queue(): Item[] {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json')).sort().flatMap((f) => {
    try { const j = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8')); return j.id && j.video && j.caption ? [j as Item] : []; } catch { return []; }
  });
}
const videoPath = (it: Item) => path.join(MEDIA_DIR, path.basename(it.video));
const videoUrl = (it: Item) => `${env.PUBLIC_URL}/media/${encodeURIComponent(path.basename(it.video))}`;

/** Автопубликация (по умолчанию включена): ролики выходят сами в 12:00 и 19:00 МСК, владелица может отменить */
export const PUB_HOURS = [12, 19];
export const autoOn = async () => (await kvGet('ig:auto')) !== '0';
/** Ближайший свободный слот публикации (12:00 или 19:00 МСК), минимум через 30 мин */
export function nextSlot(now = Date.now(), taken: number[] = []) {
  const msk = new Date(now + 3 * 3600e3);
  const day0 = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) - 3 * 3600e3;
  for (let d = 0; d < 30; d++) for (const h of PUB_HOURS) {
    const t = day0 + d * 864e5 + h * 3600e3;
    if (t - now >= 30 * 60e3 && !taken.includes(t)) return t;
  }
  return now + 3600e3;
}
const slotText = (t: number) => {
  const d = new Date(t + 3 * 3600e3), today = new Date(Date.now() + 3 * 3600e3);
  const diff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 864e5);
  return `${diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : d.toISOString().slice(8, 10) + '.' + d.toISOString().slice(5, 7)} в ${d.getUTCHours()}:00`;
};
const notifyAll = (bot: Bot, text: string, extra: any = {}) =>
  Promise.all(reportTo().map((id) => bot.api.sendMessage(Number(id), text, { link_preview_options: { is_disabled: true }, ...extra }).catch(() => null)));

/** Новые ролики из очереди: в автоматическом режиме — в расписание, иначе — на одобрение */
async function offerNew(bot: Bot, log: any) {
  for (const it of queue()) {
    if (!fs.existsSync(videoPath(it))) continue;
    const auto = (await autoOn()) && (await igEnabled());
    const taken = (await prisma.appKV.findMany({ where: { key: { startsWith: 'ig:item:' }, value: { startsWith: 'scheduled:' } } })).map((r) => Number(r.value.split(':')[1]));
    const at = nextSlot(Date.now(), taken);
    if (!(await kvClaim(`ig:item:${it.id}`, auto ? `scheduled:${at}` : 'offered'))) continue;
    const kb = auto
      ? new InlineKeyboard().text('🚫 Не публиковать', `ig:skip:${it.id}`).text('⚡ Сейчас', `ig:pub:${it.id}`)
      : new InlineKeyboard().text('✅ Опубликовать', `ig:pub:${it.id}`).text('🚫 Не публиковать', `ig:skip:${it.id}`);
    for (const id of reportTo()) {
      const { InputFile } = await import('grammy');
      await bot.api.sendVideo(Number(id), new InputFile(videoPath(it)), {
        caption: `🎬 <b>Новый ролик для Instagram</b>${it.title ? ` — ${esc(it.title)}` : ''}\n${auto ? `🤖 Выйдет сам ${slotText(at)}. Ничего делать не нужно.` : ''}\n\n${esc(it.caption).slice(0, 700)}`,
        parse_mode: 'HTML', reply_markup: kb, supports_streaming: true,
      }).catch((e: any) => log.error({ err: e }, 'ig offer'));
    }
  }
}

/** Публикация роликов, у которых подошло время */
async function publishDue(bot: Bot, log: any) {
  const rows = await prisma.appKV.findMany({ where: { key: { startsWith: 'ig:item:' }, value: { startsWith: 'scheduled:' } } });
  for (const r of rows) {
    if (Number(r.value.split(':')[1]) > Date.now()) continue;
    const id = r.key.slice('ig:item:'.length);
    const it = queue().find((x) => x.id === id);
    if (!it) { await kvSet(r.key, 'skipped'); continue; }
    await publishItem(bot, it, r.value, log);
  }
}

/** Срочная публикация по просьбе владелицы: marketing/publish-now.json { "key": "...", "ids": [...] } — каждый ролик один раз */
async function publishNow(bot: Bot, log: any) {
  const f = path.join(ROOT, 'publish-now.json');
  if (!fs.existsSync(f)) return;
  let j: { key?: string; ids?: string[] };
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return; }
  for (const id of j.ids || []) {
    const it = queue().find((x) => x.id === id);
    if (!it || !fs.existsSync(videoPath(it))) continue;
    if (!(await kvClaim(`ig:now:${j.key}:${id}`, '1'))) continue;
    const cur = await kvGet(`ig:item:${id}`);
    if (cur === 'published' || cur === 'publishing') continue;
    if (cur === null) await kvSet(`ig:item:${id}`, 'now');
    await publishItem(bot, it, cur ?? 'now', log);
  }
}

/** Захватить ролик и опубликовать; при ошибке — вернуть в расписание на завтра и сообщить */
async function publishItem(bot: Bot, it: Item, from: string, log: any) {
  const claimed = await prisma.appKV.updateMany({ where: { key: `ig:item:${it.id}`, value: from }, data: { value: 'publishing' } });
  if (!claimed.count) return false;
  try {
    const r = await publishReel(it);
    await kvSet(`ig:item:${it.id}`, 'published');
    await notifyAll(bot, `✅ Опубликовано в Instagram${it.title ? ` — ${it.title}` : ''}${r.permalink ? `\n${r.permalink}` : ''}`);
  } catch (e: any) {
    log.error({ err: e }, 'ig publish');
    await kvSet(`ig:item:${it.id}`, 'offered');
    await notifyAll(bot, `⚠️ Не получилось опубликовать «${it.title || it.id}»: ${e.message}`, { reply_markup: new InlineKeyboard().text('🔁 Ещё раз', `ig:pub:${it.id}`) });
  }
  return true;
}

/** Публикация Reels: контейнер → ждём обработку → публикуем */
export async function publishReel(it: Item) {
  const c = await ig(`/${await uid()}/media`, { media_type: 'REELS', video_url: videoUrl(it), caption: it.caption, share_to_feed: 'true' }, 'POST');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await ig(`/${c.id}`, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram не смог обработать видео: ${s.status || s.status_code}`);
  }
  const p = await ig(`/${await uid()}/media_publish`, { creation_id: c.id }, 'POST');
  const m = await ig(`/${p.id}`, { fields: 'permalink' }).catch(() => ({}));
  return { id: p.id, permalink: m.permalink as string | undefined };
}

// ---------- комментарии ----------
async function checkComments(bot: Bot, log: any) {
  const me = (await kvGet('ig:username')) || (await ig('/me', { fields: 'username' }).then(async (r) => { await kvSet('ig:username', r.username); return r.username; }));
  const media = await ig(`/${await uid()}/media`, { fields: 'id,caption,permalink,timestamp', limit: '10' });
  for (const m of media.data || []) {
    const cm = await ig(`/${m.id}/comments`, { fields: 'id,text,username,timestamp', limit: '50' }).catch(() => ({ data: [] }));
    for (const c of cm.data || []) {
      if (!c.text || c.username === me) continue;
      if (!(await kvClaim(`ig:c:${c.id}`, 'seen'))) continue;
      // код бонуса за подписку → +12 дней «Про»
      const code = codeIn(c.text);
      if (code) {
        const r = await grantByCode(code, c.username || '').catch((e) => { log.error({ err: e }, 'ig bonus'); return { status: 'unknown' as const }; });
        if (r.status === 'granted') {
          await ig(`/${c.id}/replies`, { message: `🎁 Готово! +${IG_BONUS_DAYS} дней «Про» в СМЕТА PRO начислены. Спасибо за подписку!` }, 'POST').catch((e) => log.error({ err: e }, 'ig reply'));
          await bot.api.sendMessage(Number(r.tgId), `🎉 <b>Бонус начислен: +${IG_BONUS_DAYS} дней «Про»</b> за подписку на Instagram.
Всё открыто до <b>${r.until.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</b>: сметы без ограничений, PDF с логотипом, договор, акты, учёт денег.`, { parse_mode: 'HTML' }).catch(() => {});
          for (const id of reportTo()) await bot.api.sendMessage(Number(id), `📸 Бонус за Instagram: @${esc(c.username || '?')} — +${IG_BONUS_DAYS} дн.`).catch(() => {});
          continue;
        }
        if (r.status === 'used' || r.status === 'igUsed') {
          await ig(`/${c.id}/replies`, { message: r.status === 'used' ? 'Бонус по этому коду уже начислен 🙂' : 'С этого аккаунта бонус уже получен 🙂 Один аккаунт — один бонус.' }, 'POST').catch(() => {});
          continue;
        }
      }
      const ans = autoReply(c.text);
      if (ans) { await ig(`/${c.id}/replies`, { message: ans }, 'POST').catch((e) => log.error({ err: e }, 'ig reply')); continue; }
      const spam = isSpam(c.text), human = needsHuman(c.text);
      if (!spam && !human) await kvSet(`ig:pending:${c.id}`, String(Date.now()));
      for (const id of reportTo()) {
        const msg = await bot.api.sendMessage(Number(id), `💬 <b>Комментарий в Instagram</b> от @${esc(c.username || '?')}:\n«${esc(c.text).slice(0, 900)}»\n\n<i>${spam ? 'Похоже на спам — отвечать не буду.' : human ? '⚠️ Похоже на жалобу — лучше ответить самой.' : `Если не ответите за ${FALLBACK_H} ч, отвечу сама вежливо и со ссылкой на бота.`} Чтобы ответить своими словами — ответьте на это сообщение (свайп влево).</i>${m.permalink ? `\n${m.permalink}` : ''}`, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).catch(() => null);
        if (msg) await kvSet(`ig:reply:${id}:${msg.message_id}`, c.id);
      }
    }
  }
  // вопросы, на которые владелица не ответила, — вежливый общий ответ
  const pend = await prisma.appKV.findMany({ where: { key: { startsWith: 'ig:pending:' } } });
  for (const p of pend) {
    if (Date.now() - Number(p.value) < FALLBACK_H * 3600e3) continue;
    const cid = p.key.slice('ig:pending:'.length);
    await prisma.appKV.deleteMany({ where: { key: p.key } });
    await ig(`/${cid}/replies`, { message: fallbackReply(cid) }, 'POST').catch((e) => log.error({ err: e }, 'ig fallback'));
  }
}
const FALLBACK_H = 4;

/** Отчёт по понедельникам и четвергам: подписчики, ролики за период с лайками и комментариями */
async function weeklyReport(bot: Bot) {
  const now = new Date(Date.now() + 3 * 3600e3);
  if (![1, 4].includes(now.getUTCDay()) || now.getUTCHours() < 10) return;
  if (!(await kvClaim(`ig:week:${now.toISOString().slice(0, 10)}`, '1'))) return;
  const acc = await ig('/me', { fields: 'username,followers_count,media_count' });
  const prev = Number(await kvGet('ig:followers')) || 0;
  if (acc.followers_count != null) await kvSet('ig:followers', String(acc.followers_count));
  const media = await ig(`/${await uid()}/media`, { fields: 'caption,like_count,comments_count,timestamp,permalink', limit: '25' });
  const days = now.getUTCDay() === 1 ? 4 : 3;
  const week = (media.data || []).filter((m: any) => Date.now() - Date.parse(m.timestamp) < days * 864e5);
  const lines = week.map((m: any) => `• ❤️ ${m.like_count ?? 0} · 💬 ${m.comments_count ?? 0} — ${esc((m.caption || '').split('\n')[0].slice(0, 60))}`);
  const best = [...week].sort((a: any, b: any) => (b.like_count || 0) - (a.like_count || 0))[0];
  const text = `📸 <b>Instagram за ${days} дн.</b> — @${esc(acc.username)}\nПодписчиков: <b>${acc.followers_count ?? '—'}</b>${prev && acc.followers_count != null ? ` (${acc.followers_count - prev >= 0 ? '+' : ''}${acc.followers_count - prev})` : ''} · публикаций: ${acc.media_count ?? '—'}\n\n${lines.join('\n') || 'Публикаций за период не было.'}${best ? `\n\n🏆 Лучший: ${best.permalink}` : ''}`;
  for (const id of reportTo()) await bot.api.sendMessage(Number(id), text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).catch(() => {});
}

// ---------- подключение через «Вход с Instagram» ----------
const REDIRECT = () => `${env.PUBLIC_URL}/ig/callback`;
const SCOPES = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments';
const sign = (v: string) => crypto.createHmac('sha256', env.SESSION_SECRET || 'dev').update(v).digest('base64url').slice(0, 24);
export function connectLink(adminTgId: number) {
  const st = `${adminTgId}.${Date.now() + 3600e3}`;
  return `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${env.IG_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT())}&response_type=code&scope=${SCOPES}&state=${encodeURIComponent(`${st}.${sign(st)}`)}`;
}
/** Обмен кода на долгий токен (60 дней) и сохранение. Возвращает ник аккаунта. */
export async function finishConnect(code: string, state: string) {
  // Вход мог начаться не из бота (ссылка из панели Meta) — тогда state нет; это безопасно:
  // приложение в режиме разработки пускает только аккаунты-тестировщики владелицы.
  const [tg, exp, sig] = state.split('.');
  const fromBot = !!tg && !!exp && sign(`${tg}.${exp}`) === sig && Number(exp) > Date.now();
  if (!code) throw new Error('Instagram не передал код входа — отправьте боту /instagram и попробуйте ещё раз');
  const r1 = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: new URLSearchParams({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: REDIRECT(), code: code.replace(/#_$/, '') }) });
  const j1: any = await r1.json().catch(() => ({}));
  if (!j1.access_token) throw new Error(j1.error_message || j1.error?.message || 'Instagram не выдал доступ');
  const r2 = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(env.IG_APP_SECRET)}&access_token=${encodeURIComponent(j1.access_token)}`);
  const j2: any = await r2.json().catch(() => ({}));
  const long = j2.access_token || j1.access_token;
  const me: any = await (await fetch(`${API}/me?fields=user_id,username&access_token=${encodeURIComponent(long)}`)).json().catch(() => ({}));
  const id = String(me.user_id || me.id || j1.user_id || '');
  if (!id) throw new Error('Не удалось узнать ID аккаунта Instagram');
  await kvSet('ig:token', long); await kvSet('ig:userId', id); await kvSet('ig:tokenAt', String(Date.now())); await kvSet('ig:username', me.username || '');
  cached = null;
  return { username: me.username as string, tg: fromBot ? [Number(tg)] : reportTo().map(Number) };
}

// ---------- бот: кнопки и ответы ----------
const OWNER = '503303776';
export function attachInstagram(bot: Bot) {
  const isAdmin = (id?: number) => id != null && (reportTo().includes(String(id)) || String(id) === OWNER);
  const connect = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply(`Эта команда только для владельца. Ваш Telegram ID: ${ctx.from?.id}`);
    if (!env.IG_APP_ID || !env.IG_APP_SECRET) return ctx.reply('Сначала добавьте в Railway переменные IG_APP_ID и IG_APP_SECRET (ID и секрет приложения Instagram из панели Meta).');
    const on = await igEnabled();
    // состояние очереди роликов
    const rows = await prisma.appKV.findMany({ where: { key: { startsWith: 'ig:item:' } } });
    const st = new Map(rows.map((r) => [r.key.slice(8), r.value]));
    const fmt = (v?: string) => !v ? 'новый' : v.startsWith('scheduled:') ? `выйдет ${slotText(Number(v.split(':')[1]))}` : ({ offered: 'ждёт кнопки «Опубликовать»', publishing: 'публикуется', published: '✅ опубликован', skipped: 'пропущен' } as any)[v] || v;
    const q = queue().slice(-8).map((it) => `• ${it.title || it.id} — ${fmt(st.get(it.id))}`).join('\n');
    const blocked = await kvGet('ig:blocked');
    if (q) await ctx.reply(`🎬 Очередь роликов:\n${q}${blocked ? `\n\n⚠️ Instagram отвечает: «${blocked}». Публикация остановлена — проверьте приложение в панели Meta и войдите заново кнопкой ниже.` : ''}`);
    await ctx.reply(`${on ? '✅ Instagram подключён' + ((await kvGet('ig:username')) ? ` (@${await kvGet('ig:username')})` : '') + '. Переподключить:' : '📸 Подключите Instagram — нажмите кнопку, войдите в аккаунт и разрешите доступ:'}`,
      { reply_markup: await panelKb(ctx.from!.id) });
  };
  const panelKb = async (tg: number) => new InlineKeyboard().url('Войти через Instagram', connectLink(tg)).row()
    .text(`🤖 Автопубликация: ${(await autoOn()) ? 'ВКЛ' : 'выкл'}`, 'ig:auto');
  bot.command(['instagram', 'insta', 'inst', 'ig'], connect);
  bot.hears(/^\/?(инст|инста|инстаграм|инстаграмм|instagram|insta)\s*$/i, connect);
  bot.callbackQuery(/^ig:(pub|skip):([\w.-]{1,80})$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery();
    const [, act, id] = ctx.match as RegExpMatchArray;
    const it = queue().find((x) => x.id === id);
    const state = (await kvGet(`ig:item:${id}`)) || '';
    if (!it) return ctx.answerCallbackQuery({ text: 'Ролик не найден в очереди' });
    if (state !== 'offered' && !state.startsWith('scheduled:')) return ctx.answerCallbackQuery({ text: state === 'published' ? 'Уже опубликован' : 'Уже обработан' });
    if (act === 'skip') { await kvSet(`ig:item:${id}`, 'skipped'); await ctx.editMessageReplyMarkup().catch(() => {}); return ctx.answerCallbackQuery({ text: 'Не публикуем' }); }
    if (!(await igEnabled())) return ctx.answerCallbackQuery({ text: 'Instagram ещё не подключён — отправьте боту /instagram', show_alert: true });
    await ctx.answerCallbackQuery({ text: 'Публикую… это 1–3 минуты' });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await publishItem(bot, it, state, console);
  });
  bot.callbackQuery('ig:auto', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery();
    const on = !(await autoOn());
    await kvSet('ig:auto', on ? '1' : '0');
    await ctx.editMessageReplyMarkup({ reply_markup: await panelKb(ctx.from.id) }).catch(() => {});
    await ctx.answerCallbackQuery({ text: on ? `Автопубликация включена: ролики выходят сами в ${PUB_HOURS.map((h) => h + ':00').join(' и ')}` : 'Автопубликация выключена: буду присылать на одобрение', show_alert: true });
  });
  // ответ администратора на пересланный комментарий → в Instagram
  bot.on('message:text', async (ctx, next) => {
    const rt = ctx.message.reply_to_message;
    if (!rt || !isAdmin(ctx.from?.id)) return next();
    const commentId = await kvGet(`ig:reply:${ctx.from.id}:${rt.message_id}`);
    if (!commentId) return next();
    try { await ig(`/${commentId}/replies`, { message: ctx.message.text }, 'POST'); await prisma.appKV.deleteMany({ where: { key: `ig:pending:${commentId}` } }); await ctx.reply('✅ Ответ отправлен в Instagram'); }
    catch (e: any) { await ctx.reply(`⚠️ Не отправилось: ${e.message}`); }
  });
}

export function startInstagram(bot: Bot, log: { error: (o: any, m?: string) => void; info: (m: string) => void }) {
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      await offerNew(bot, log);
      if (await igEnabled()) {
        await publishNow(bot, log).catch((e) => log.error({ err: e }, 'ig now'));
        await publishDue(bot, log).catch((e) => log.error({ err: e }, 'ig due'));
        await refreshToken(log).catch((e) => log.error({ err: e }, 'ig token'));
        await checkComments(bot, log).then(() => prisma.appKV.deleteMany({ where: { key: 'ig:blocked' } })).catch(async (e) => {
          log.error({ err: e }, 'ig comments');
          if (/blocked|expired|session|OAuth|permission/i.test(String(e?.message))) {
            await kvSet('ig:blocked', String(e.message).slice(0, 200));
            if (await kvClaim(`ig:blockedNote:${new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)}`, '1'))
              await notifyAll(bot, `⚠️ Instagram закрыл доступ приложению: «${e.message}». Ролики не публикуются. Откройте панель Meta (developers.facebook.com → ваше приложение) — там будет красное уведомление «Требуется действие», и войдите заново: напишите боту «инст» → «Войти через Instagram».`);
          }
        });
        await weeklyReport(bot).catch((e) => log.error({ err: e }, 'ig report'));
      }
    } finally { running = false; }
  };
  setTimeout(tick, 20000);
  setInterval(tick, 10 * 60e3);
  igEnabled().then((on) => log.info(`Instagram-агент: ${on ? 'подключён' : 'ждёт подключения (/instagram в боте)'}, в очереди ${queue().length}`));
}
