import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma, plain, HttpError, accessOf, num } from '../util';
import { TIERS } from '../../../shared/plans';
import { botLink } from '../botInfo';
import { syncTeam } from './billing';
import { upsertItems } from './catalog';

/**
 * Бригада (тариф «Бригада»): владелец приглашает до 4 человек по ссылке.
 * Участники получают доступ уровня «Бригада», пока у владельца активна подписка,
 * и общий справочник цен: владелец рассылает свой прайс, участникам он добавляется/обновляется по названиям.
 */
const SEATS = TIERS.team.seats;
const name = (u: any) => [u.firstName, u.username ? `@${u.username}` : ''].filter(Boolean).join(' ') || 'Без имени';

/** Своя (не через бригаду) подписка «Бригада» */
const ownsTeam = (u: any) => u.plan === 'team' && u.subscriptionUntil && u.subscriptionUntil > new Date();

/** Скопировать основной прайс владельца участникам (одному или всем) */
export async function pushPrices(ownerId: string, memberIds?: string[]) {
  const list = await prisma.priceList.findFirst({ where: { userId: ownerId, isDefault: true } });
  if (!list) return { members: 0, items: 0 };
  const items = await prisma.catalogItem.findMany({ where: { userId: ownerId, priceListId: list.id, deletedAt: null, active: true }, take: 2000 });
  const rows = items.map((i) => ({
    name: i.name, unit: i.unit, type: i.type as any, category: i.category, price: num(i.price), composition: i.description,
    matPrice: Number((i.params as any)?.matPrice) > 0 ? Number((i.params as any).matPrice) : undefined,
  }));
  const members = memberIds || (await prisma.user.findMany({ where: { teamOwnerId: ownerId }, select: { id: true } })).map((m) => m.id);
  for (const id of members) {
    for (let i = 0; i < rows.length; i += 300) await upsertItems(id, null, rows.slice(i, i + 300), true);
  }
  return { members: members.length, items: rows.length };
}

/** Вступить в бригаду по токену приглашения. Используется и приложением, и ботом (/start team_…) */
export async function joinTeam(userId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{12,40}$/.test(token)) throw new HttpError(400, 'Ссылка-приглашение неверная');
  const owner = await prisma.user.findFirst({ where: { teamToken: token } });
  if (!owner) throw new HttpError(404, 'Приглашение устарело — попросите новую ссылку');
  if (owner.id === userId) throw new HttpError(400, 'Это ваша бригада');
  if (!ownsTeam(owner)) throw new HttpError(402, 'У бригадира не активен тариф «Бригада»');
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (me.teamOwnerId === owner.id) return { owner: name(owner), already: true };
  if (await prisma.user.count({ where: { teamOwnerId: userId } })) throw new HttpError(400, 'У вас своя бригада — сначала распустите её');
  const count = await prisma.user.count({ where: { teamOwnerId: owner.id } });
  if (count >= SEATS - 1) throw new HttpError(400, `В бригаде уже ${SEATS} человек — это максимум тарифа`);
  await prisma.user.update({ where: { id: userId }, data: { teamOwnerId: owner.id, teamUntil: owner.subscriptionUntil } });
  await pushPrices(owner.id, [userId]).catch(() => {});
  return { owner: owner.companyName || name(owner), already: false };
}

export async function teamRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  app.get('/api/team', async (req) => {
    const u: any = req.user;
    if (u.teamOwnerId) {
      const owner = await prisma.user.findUnique({ where: { id: u.teamOwnerId } });
      return plain({ role: 'member', owner: owner ? (owner.companyName || name(owner)) : '—', until: u.teamUntil, active: accessOf(u).mode === 'team' });
    }
    const members = await prisma.user.findMany({ where: { teamOwnerId: u.id }, orderBy: { createdAt: 'asc' } });
    return plain({
      role: ownsTeam(u) ? 'owner' : 'none', seats: SEATS, until: u.subscriptionUntil,
      inviteUrl: u.teamToken && ownsTeam(u) ? botLink(`team_${u.teamToken}`) : null,
      members: members.map((m) => ({ id: m.id, name: name(m), since: m.createdAt })),
    });
  });

  app.post('/api/team/invite', async (req) => {
    const u: any = req.user;
    if (!ownsTeam(u)) throw new HttpError(402, 'Пригласить бригаду можно в тарифе «Бригада»', 'plan_required');
    const token = u.teamToken || crypto.randomBytes(12).toString('base64url');
    if (!u.teamToken) await prisma.user.update({ where: { id: u.id }, data: { teamToken: token } });
    const url = botLink(`team_${token}`);
    if (!url) throw new HttpError(503, 'Бот не настроен — ссылку сделать нельзя');
    return { url };
  });

  // новая ссылка: старая перестаёт работать
  app.post('/api/team/invite/reset', async (req) => {
    const u: any = req.user;
    if (!ownsTeam(u)) throw new HttpError(402, 'Доступно в тарифе «Бригада»', 'plan_required');
    const token = crypto.randomBytes(12).toString('base64url');
    await prisma.user.update({ where: { id: u.id }, data: { teamToken: token } });
    return { url: botLink(`team_${token}`) };
  });

  app.post('/api/team/join', async (req) => {
    const { token } = z.object({ token: z.string().max(60) }).parse(req.body);
    return joinTeam(req.user.id, token);
  });

  app.delete('/api/team/members/:id', async (req) => {
    const { id } = req.params as any;
    const m = await prisma.user.findFirst({ where: { id, teamOwnerId: req.user.id } });
    if (!m) throw new HttpError(404, 'Участник не найден');
    await prisma.user.update({ where: { id }, data: { teamOwnerId: null, teamUntil: null } });
    if (opts.bot) await opts.bot.api.sendMessage(Number(m.tgId), 'Вас убрали из бригады. Сметы и справочник остались у вас.').catch(() => {});
    return { ok: true };
  });

  app.post('/api/team/leave', async (req) => {
    await prisma.user.update({ where: { id: req.user.id }, data: { teamOwnerId: null, teamUntil: null } });
    return { ok: true };
  });

  // общий справочник: разослать свой прайс участникам
  app.post('/api/team/push-prices', async (req) => {
    if (!ownsTeam(req.user)) throw new HttpError(402, 'Доступно в тарифе «Бригада»', 'plan_required');
    await syncTeam(req.user.id);
    return pushPrices(req.user.id);
  });
}
