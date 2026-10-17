import { Prisma } from '@prisma/client';
import { FREE_ESTIMATES } from '../../../shared/access';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { prisma, plain, accessOf, HttpError, freeCtx } from '../util';
import { TIERS, monthKey } from '../../../shared/plans';
import { applyPromo, findPromo } from './promo';
import { verifyInitData, signSession } from '../auth';
import { STARTER_PRICES } from '../../../shared/starterPrices';
import { channelTag } from '../../../shared/promo';
import { compositionFor } from '../../../shared/compositions';
import { brandUrl } from './brand';

const THEME_IDS = ['blueprint', 'brick', 'concrete', 'rebar', 'wood', 'topo', 'hazard', 'paving'];
import { botLink } from '../botInfo';
import { mskDay } from '../stats';

/** Кто пригласил: payload вида ref_<id пользователя> из /start или startapp */
async function referrerId(payload?: string | null) {
  const m = /^ref_([a-z0-9]{10,40})$/i.exec(payload || '');
  if (!m) return null;
  const r = await prisma.user.findUnique({ where: { id: m[1] }, select: { id: true } });
  return r?.id ?? null;
}

export async function upsertUser(tgId: number, firstName?: string, username?: string, startPayload?: string | null) {
  const existing = await prisma.user.findUnique({ where: { tgId: BigInt(tgId) } });
  const promo = /^p_([A-Za-zА-Яа-яЁё0-9_-]{3,24})$/.exec(startPayload || '')?.[1];
  if (existing) {
    // старый пользователь пришёл по ссылке блогера — привязываем код, если подписки ещё не было
    if (promo && !existing.promoCode) await applyPromo(existing.id, promo).catch(() => {});
    return prisma.user.update({ where: { id: existing.id }, data: { firstName, username } });
  }
  const user = await prisma.user.create({
    data: {
      tgId: BigInt(tgId), firstName, username, referredById: await referrerId(startPayload),
      trialEndsAt: new Date(Date.now() + env.PRO_TRIAL_DAYS * 86400000),
      priceLists: { create: { name: 'Основной прайс', isDefault: true } },
    },
    include: { priceLists: true },
  });
  // метка рекламного канала: t.me/бот?start=card, ?start=vk, ?start=chat_prorab … — для сводки «откуда пришли»
  const src = channelTag(startPayload);
  if (src) await prisma.appKV.create({ data: { key: `src:${user.id}`, value: src } }).catch(() => {});
  if (promo) {
    await applyPromo(user.id, promo, true).catch(() => {});
    Object.assign(user, await prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
  }
  // Новый пользователь сразу получает справочник работ с примерными ценами — первую смету можно собрать за минуты
  try {
    await prisma.catalogItem.createMany({
      data: STARTER_PRICES.map((r) => ({
        userId: user.id, priceListId: user.priceLists[0].id, name: r.name, category: r.category, unit: r.unit, price: r.price,
        type: r.category === 'Аренда техники' ? 'equipment' : r.name.startsWith('Вывоз') || r.category === 'Доставка' ? 'service' : 'work',
        notes: 'Примерная цена — проверьте и поправьте под свой регион', params: { starter: true },
        description: compositionFor(r.name)?.join('\n') ?? null,
      })),
    });
  } catch { /* справочник можно добавить позже вручную */ }
  return user;
}

export async function meView(user: any) {
  const free = await freeCtx(user.id, user.extraEstimates);
  const acc = accessOf(user);
  const aiWish = Boolean(await prisma.auditLog.findFirst({ where: { userId: user.id, entity: 'ai', action: { in: ['wish', 'wish_notified'] } }, select: { id: true } }));
  return plain({
    id: user.id, tgId: user.tgId, firstName: user.firstName, username: user.username,
    companyName: user.companyName, contacts: user.contacts, aiEnabled: user.aiEnabled, theme: user.themeChosen && THEME_IDS.includes(user.theme) ? user.theme : 'blueprint',
    aiAvailable: Boolean(env.AI_PROVIDER), aiWish,
    promo: user.promoCode ? await findPromo(user.promoCode).then((p) => (p ? { code: p.code, discountPct: p.discountPct } : null)) : null,
    access: { ...acc, freeEstimateLeft: free.estimateCount < free.limit, freeLeft: Math.max(0, free.limit - free.estimateCount), freeLimit: free.limit, freeEstimateIds: free.freeEstimateIds, paidEstimateIds: free.paidEstimateIds, estimateCount: free.estimateCount },
    plan: {
      tier: acc.tier, label: TIERS[acc.tier].label, aiLimit: TIERS[acc.tier].ai, aiUsed: user.aiMonth === monthKey() ? user.aiUsed : 0,
      extraDesigns: user.extraDesigns || 0, extraUntil: user.extraUntil || null, studioUntil: user.studioUntil && user.studioUntil > new Date() ? user.studioUntil : null,
      offer: user.offerPct && user.offerUntil && user.offerUntil > new Date() ? { pct: user.offerPct, until: user.offerUntil } : null, team: user.teamOwnerId ? 'member' : user.plan === 'team' && acc.mode === 'subscription' ? 'owner' : null,
    },
    isAdmin: env.ADMIN_TG_IDS.includes(String(user.tgId)),
    logoUrl: brandUrl(user.logoFile), signUrl: brandUrl(user.signFile),
    weeklyDigest: user.weeklyDigest ?? true, docStyle: user.docStyle || 'classic', designPrices: user.designPrices || null,
    pay: { yookassa: Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY), receipt: env.YOOKASSA_RECEIPT },
    refLink: botLink(`ref_${user.id}`),
    supportLink: botLink('help'),
  });
}

/** Заход в приложение — для сводки администратору */
async function trackOpen(userId: string) {
  const day = mskDay(new Date());
  await prisma.userDay.upsert({ where: { userId_day: { userId, day } }, create: { userId, day }, update: { opens: { increment: 1 }, lastAt: new Date() } });
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/telegram', async (req) => {
    const { initData } = z.object({ initData: z.string().min(1) }).parse(req.body);
    if (!env.BOT_TOKEN) throw new HttpError(503, 'Бот ещё не настроен на сервере (нет BOT_TOKEN)', 'bot_not_configured');
    let tg;
    try { tg = verifyInitData(initData, env.BOT_TOKEN); } catch (e: any) { throw new HttpError(401, e.message, 'bad_init_data'); }
    const user = await upsertUser(tg.id, tg.first_name, tg.username, new URLSearchParams(initData).get('start_param'));
    trackOpen(user.id).catch(() => {});
    return { token: signSession(user.id, env.SESSION_SECRET), user: await meView(user) };
  });

  // Только для разработки вне Telegram (DEV_AUTH=1)
  app.post('/api/auth/dev', async (req) => {
    if (!env.DEV_AUTH) throw new HttpError(404, 'Не найдено');
    const { tgId, name } = z.object({ tgId: z.number().int(), name: z.string().optional() }).parse(req.body);
    const user = await upsertUser(tgId, name || 'Тест');
    return { token: signSession(user.id, env.SESSION_SECRET || 'dev-secret'), user: await meView(user) };
  });

  app.get('/api/me', async (req) => meView(req.user));

  // «Приведи друга»: сколько пришло и сколько оплатили
  app.get('/api/referrals', async (req) => {
    const [invited, paid] = await Promise.all([
      prisma.user.count({ where: { referredById: req.user.id } }),
      prisma.user.count({ where: { referredById: req.user.id, referralRewardedAt: { not: null } } }),
    ]);
    return { link: botLink(`ref_${req.user.id}`), invited, paid, bonusMonths: paid };
  });

  app.patch('/api/me', async (req) => {
    const body = z.object({
      aiEnabled: z.boolean().optional(),
      weeklyDigest: z.boolean().optional(),
      docStyle: z.enum(['classic', 'modern']).optional(),
      theme: z.enum(THEME_IDS as [string, ...string[]]).optional(),
      companyName: z.string().max(200).nullable().optional(),
      contacts: z.string().max(500).nullable().optional(),
      designPrices: z.record(z.string().max(40), z.number().positive().max(1e8)).nullable().optional(),
    }).parse(req.body);
    const { designPrices, ...rest } = body;
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { ...rest, ...(body.theme ? { themeChosen: true } : {}), ...(designPrices !== undefined ? { designPrices: designPrices === null ? Prisma.DbNull : designPrices } : {}) } });
    return meView(user);
  });
}
