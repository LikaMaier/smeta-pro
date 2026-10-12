import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, plain, notFound, HttpError, DEFAULT_CATEGORIES, num } from '../util';
import { STARTER_PRICES } from '../../../shared/starterPrices';
import { compositionFor } from '../../../shared/compositions';
import { runImport, renderXlsx, fileName } from '../pdf';
import { normName } from '../../../shared/names';

const ITEM_TYPES = ['work', 'material', 'equipment', 'service', 'other'] as const;
const money = z.coerce.number().min(0, 'не может быть отрицательной').max(1e11);

const itemSchema = z.object({
  priceListId: z.string(),
  name: z.string().trim().min(1, 'введите название').max(300),
  type: z.enum(ITEM_TYPES),
  category: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1, 'укажите единицу').max(30),
  price: money,
  costPrice: money.nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  params: z.any().optional(),
  active: z.boolean().optional(),
});

const upsertItem = z.object({
  name: z.string().trim().min(1).max(300), unit: z.string().trim().min(1).max(30),
  type: z.enum(['work', 'material', 'equipment', 'service', 'other']), category: z.string().max(100).nullable().optional(),
  price: z.coerce.number().min(0).max(1e11), composition: z.string().max(3000).nullable().optional(),
  matPrice: z.coerce.number().min(0).max(1e11).nullable().optional(), // цена материала в строке «работа с материалом»
});
const matOf = (params: any) => { const v = Number(params?.matPrice); return Number.isFinite(v) && v > 0 ? v : null; };

/** Обновить цены позиций с тем же названием, при addNew — добавить отсутствующие. История цен сохраняется. */
export async function upsertItems(userId: string, listId: string | null, items: z.infer<typeof upsertItem>[], addNew: boolean) {
  const list = listId ? { id: listId } : await prisma.priceList.findFirst({ where: { userId, isDefault: true } }) || await prisma.priceList.findFirst({ where: { userId } });
  if (!list) throw new HttpError(400, 'Нет прайс-листа');
  const existing = await prisma.catalogItem.findMany({ where: { userId, priceListId: list.id, deletedAt: null } });
  const byName = new Map(existing.map((i) => [normName(i.name), i]));
  let updated = 0, created = 0, same = 0;
  const ids: Record<string, string> = {};
  const now = new Date();
  for (const it of items) {
    const key = normName(it.name);
    const ex = byName.get(key);
    const mat = it.matPrice === undefined ? undefined : (it.matPrice && it.matPrice > 0 ? it.matPrice : null);
    if (ex) {
      ids[key] = ex.id;
      const matSame = mat === undefined || matOf(ex.params) === mat;
      if (num(ex.price) === it.price && matSame) { same++; continue; }
      const base = ex.notes?.startsWith('Примерная цена') ? {} : ((ex.params as any) || {});
      const params = mat === undefined ? (ex.notes?.startsWith('Примерная цена') ? {} : undefined) : { ...base, matPrice: mat };
      await prisma.catalogItem.update({
        where: { id: ex.id },
        data: { price: it.price, priceUpdatedAt: now, ...(it.type === 'material' ? { costPrice: it.price } : {}),
          ...(ex.notes?.startsWith('Примерная цена') ? { notes: null } : {}), ...(params !== undefined ? { params } : {}) },
      });
      if (num(ex.price) !== it.price) await prisma.priceHistory.create({ data: { itemId: ex.id, price: it.price } });
      updated++;
    } else if (addNew) {
      const c = await prisma.catalogItem.create({
        data: { userId, priceListId: list.id, name: it.name.trim(), unit: it.unit, type: it.type, category: it.category || 'Прочее',
          price: it.price, costPrice: it.type === 'material' ? it.price : null, description: it.composition || null, priceUpdatedAt: now,
          ...(mat ? { params: { matPrice: mat } } : {}) },
      });
      await prisma.priceHistory.create({ data: { itemId: c.id, price: it.price } });
      byName.set(key, c);
      ids[key] = c.id;
      created++;
    }
  }
  return { updated, created, same, ids };
}

export async function catalogRoutes(app: FastifyInstance, opts: { bot?: any } = {}) {
  const ownList = async (userId: string, id: string) => {
    const l = await prisma.priceList.findFirst({ where: { id, userId } });
    if (!l) throw notFound('Прайс-лист');
    return l;
  };
  const ownItem = async (userId: string, id: string) => {
    const i = await prisma.catalogItem.findFirst({ where: { id, userId, deletedAt: null } });
    if (!i) throw notFound('Позиция');
    return i;
  };

  app.get('/api/categories', async (req) => {
    const rows = await prisma.catalogItem.findMany({ where: { userId: req.user.id, deletedAt: null }, distinct: ['category'], select: { category: true } });
    const set = new Set([...DEFAULT_CATEGORIES, ...rows.map((r) => r.category)]);
    return [...set];
  });

  // ---- Прайс-листы ----
  app.get('/api/pricelists', async (req) => {
    const lists = await prisma.priceList.findMany({
      where: { userId: req.user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    return plain(lists.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault, itemsCount: l._count.items })));
  });

  app.post('/api/pricelists', async (req) => {
    const { name, copyFromId } = z.object({ name: z.string().trim().min(1).max(100), copyFromId: z.string().optional() }).parse(req.body);
    const list = await prisma.priceList.create({ data: { userId: req.user.id, name } });
    if (copyFromId) {
      await ownList(req.user.id, copyFromId);
      const items = await prisma.catalogItem.findMany({ where: { userId: req.user.id, priceListId: copyFromId, deletedAt: null } });
      for (const it of items) {
        const { id, createdAt, priceListId, ...rest } = it as any;
        await prisma.catalogItem.create({ data: { ...rest, params: rest.params ?? undefined, priceListId: list.id } });
      }
    }
    return plain(list);
  });

  app.patch('/api/pricelists/:id', async (req) => {
    const { id } = req.params as any;
    await ownList(req.user.id, id);
    const body = z.object({ name: z.string().trim().min(1).max(100).optional(), isDefault: z.literal(true).optional() }).parse(req.body);
    if (body.isDefault) await prisma.priceList.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    return plain(await prisma.priceList.update({ where: { id }, data: body }));
  });

  app.delete('/api/pricelists/:id', async (req) => {
    const { id } = req.params as any;
    const l = await ownList(req.user.id, id);
    const count = await prisma.priceList.count({ where: { userId: req.user.id } });
    if (count <= 1) throw new HttpError(400, 'Нельзя удалить единственный прайс-лист');
    await prisma.priceList.delete({ where: { id } });
    if (l.isDefault) {
      const first = await prisma.priceList.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'asc' } });
      if (first) await prisma.priceList.update({ where: { id: first.id }, data: { isDefault: true } });
    }
    return { ok: true };
  });

  // ---- Позиции ----
  app.get('/api/items', async (req) => {
    const q = z.object({
      priceListId: z.string().optional(), q: z.string().optional(), type: z.string().optional(),
      category: z.string().optional(), includeInactive: z.string().optional(),
    }).parse(req.query);
    let priceListId = q.priceListId;
    if (!priceListId) {
      const def = await prisma.priceList.findFirst({ where: { userId: req.user.id, isDefault: true } });
      priceListId = def?.id;
    }
    const items = await prisma.catalogItem.findMany({
      where: {
        userId: req.user.id, deletedAt: null, priceListId,
        ...(q.includeInactive ? {} : { active: true }),
        ...(q.type ? { type: q.type } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return plain(items);
  });

  // Запомнить цены из мастера/калькулятора: обновить позиции с таким же названием или добавить новые
  app.post('/api/items/bulk-upsert', async (req) => {
    const { items } = z.object({ items: z.array(upsertItem).max(300) }).parse(req.body);
    return upsertItems(req.user.id, null, items, true);
  });

  // Выгрузить справочник в Excel (поменять цены и загрузить обратно)
  app.post('/api/items/export/send', async (req) => {
    const { priceListId } = z.object({ priceListId: z.string().optional() }).parse(req.body || {});
    const list = priceListId ? await prisma.priceList.findFirst({ where: { id: priceListId, userId: req.user.id } }) : await prisma.priceList.findFirst({ where: { userId: req.user.id, isDefault: true } });
    if (!list) throw notFound('Прайс-лист');
    if (!opts.bot) throw new HttpError(503, 'Бот не подключён — отправить файл в чат нельзя', 'bot_not_configured');
    const items = await prisma.catalogItem.findMany({ where: { userId: req.user.id, priceListId: list.id, deletedAt: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    const TL: Record<string, string> = { work: 'Работа', material: 'Материал', equipment: 'Техника', service: 'Услуга', other: 'Прочее' };
    const buf = await renderXlsx({ kind: 'catalog', list: list.name, items: items.map((i) => ({ name: i.name, unit: i.unit, price: num(i.price), category: i.category, typeLabel: TL[i.type] || i.type })) });
    const { InputFile } = await import('grammy');
    await opts.bot.api.sendDocument(Number(req.user.tgId), new InputFile(buf, fileName(`Справочник — ${list.name}`, 'xlsx')), {
      caption: `Ваш справочник: ${items.length} позиций. Поменяйте цены в Excel и загрузите обратно: Справочник → «Прайс поставщика».`,
    });
    return { ok: true, count: items.length };
  });

  // Прайс поставщика из Excel: предпросмотр (что обновится / добавится) и применение
  app.post('/api/items/import-pricelist', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const b = z.object({
      data: z.string().min(10), apply: z.boolean().default(false), priceKind: z.enum(['retail', 'opt']).default('retail'),
      type: z.enum(['material', 'work', 'equipment', 'service']).default('material'), addNew: z.boolean().default(true),
      priceListId: z.string().optional(), markupPct: z.coerce.number().min(-90).max(500).default(0),
    }).parse(req.body);
    const buf = Buffer.from(b.data.replace(/^data:[^,]*,/, ''), 'base64');
    if (buf.length > 8 * 1024 * 1024) throw new HttpError(413, 'Файл больше 8 МБ');
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new HttpError(400, 'Нужен файл Excel .xlsx (старый .xls пересохраните как .xlsx)');
    const parsed = JSON.parse((await runImport(buf, ['--pricelist', ...(b.priceKind === 'opt' ? ['--opt'] : [])])).toString('utf8'));
    const k = 1 + b.markupPct / 100;
    const rows = (parsed.lines as any[]).filter((l) => l.price > 0).map((l) => ({
      name: String(l.name).slice(0, 300), unit: String(l.unit || 'шт').slice(0, 30), type: b.type, category: l.category || (b.type === 'material' ? 'Материалы' : 'Прочее'),
      price: Math.round(l.price * k * 100) / 100,
    }));
    const listId = b.priceListId || (await prisma.priceList.findFirst({ where: { userId: req.user.id, isDefault: true } }))?.id;
    if (!listId) throw new HttpError(400, 'Нет прайс-листа');
    await ownList(req.user.id, listId);
    if (!b.apply) {
      const existing = await prisma.catalogItem.findMany({ where: { userId: req.user.id, priceListId: listId, deletedAt: null }, select: { name: true, price: true } });
      const by = new Map(existing.map((i) => [normName(i.name), num(i.price)]));
      const preview = rows.map((r) => {
        const old = by.get(normName(r.name));
        return { ...r, old: old ?? null, status: old == null ? 'new' : old === r.price ? 'same' : 'update' };
      });
      return {
        rows: preview.slice(0, 500), total: preview.length, withoutPrice: (parsed.lines as any[]).length - rows.length,
        counts: { update: preview.filter((p) => p.status === 'update').length, new: preview.filter((p) => p.status === 'new').length, same: preview.filter((p) => p.status === 'same').length },
      };
    }
    return upsertItems(req.user.id, listId, rows, b.addNew);
  });

  app.post('/api/items', async (req) => {
    const body = itemSchema.parse(req.body);
    await ownList(req.user.id, body.priceListId);
    const item = await prisma.catalogItem.create({ data: { ...body, userId: req.user.id } });
    await prisma.priceHistory.create({ data: { itemId: item.id, price: item.price, costPrice: item.costPrice } });
    return plain(item);
  });

  app.patch('/api/items/:id', async (req) => {
    const { id } = req.params as any;
    const prev = await ownItem(req.user.id, id);
    const body = itemSchema.partial().parse(req.body);
    if (body.priceListId) await ownList(req.user.id, body.priceListId);
    const priceChanged = (body.price != null && body.price !== num(prev.price)) ||
      (body.costPrice !== undefined && (body.costPrice ?? null) !== (prev.costPrice == null ? null : num(prev.costPrice)));
    const item = await prisma.catalogItem.update({
      where: { id }, data: {
        ...body,
        // своя цена вместо примерной — снимаем пометку «примерная»
        ...(priceChanged ? { priceUpdatedAt: new Date(), ...((prev.params as any)?.starter ? { params: { ...(prev.params as any), starter: false } } : {}) } : {}),
      },
    });
    // Изменение цены НЕ затрагивает сохранённые сметы: в строках сметы хранится копия цены.
    if (priceChanged) await prisma.priceHistory.create({ data: { itemId: id, price: item.price, costPrice: item.costPrice } });
    return plain(item);
  });

  app.delete('/api/items/:id', async (req) => {
    const { id } = req.params as any;
    await ownItem(req.user.id, id);
    await prisma.catalogItem.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

  app.get('/api/items/:id/history', async (req) => {
    const { id } = req.params as any;
    await ownItem(req.user.id, id);
    return plain(await prisma.priceHistory.findMany({ where: { itemId: id }, orderBy: { changedAt: 'desc' }, take: 100 }));
  });

  // Добавить стартовый набор работ с ориентировочными ценами (только выбранные разделы, без дублей)
  app.post('/api/items/import-starter', async (req) => {
    const { priceListId, categories } = z.object({ priceListId: z.string(), categories: z.array(z.string()).min(1) }).parse(req.body);
    await ownList(req.user.id, priceListId);
    const existing = new Set((await prisma.catalogItem.findMany({ where: { userId: req.user.id, priceListId, deletedAt: null }, select: { name: true } })).map((i) => i.name.toLowerCase()));
    const rows = STARTER_PRICES.filter((p) => categories.includes(p.category) && !existing.has(p.name.toLowerCase()));
    // пакетная вставка: сотни позиций за пару запросов
    const now = new Date();
    await prisma.catalogItem.createMany({
      data: rows.map((r) => ({
        userId: req.user.id, priceListId, name: r.name, category: r.category, unit: r.unit, price: r.price, priceUpdatedAt: now,
        type: r.category === 'Аренда техники' ? 'equipment' : r.name.startsWith('Вывоз') || r.category === 'Доставка' ? 'service' : 'work',
        notes: 'Примерная цена — проверьте и поправьте под свой регион', params: { starter: true },
        description: compositionFor(r.name)?.join('\n') ?? null,
      })),
    });
    const created = await prisma.catalogItem.findMany({ where: { userId: req.user.id, priceListId, priceUpdatedAt: now, deletedAt: null }, select: { id: true, price: true } });
    if (created.length) await prisma.priceHistory.createMany({ data: created.map((i) => ({ itemId: i.id, price: i.price, changedAt: now })) });
    return { ok: true, added: rows.length };
  });

  // Копирование / перенос позиций между прайс-листами
  app.post('/api/items/copy', async (req) => {
    const { itemIds, toPriceListId, move } = z.object({ itemIds: z.array(z.string()).min(1).max(1000), toPriceListId: z.string(), move: z.boolean().optional() }).parse(req.body);
    await ownList(req.user.id, toPriceListId);
    const items = await prisma.catalogItem.findMany({ where: { id: { in: itemIds }, userId: req.user.id, deletedAt: null } });
    if (move) {
      await prisma.catalogItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { priceListId: toPriceListId } });
    } else {
      for (const it of items) {
        const { id, createdAt, priceListId, ...rest } = it as any;
        await prisma.catalogItem.create({ data: { ...rest, params: rest.params ?? undefined, priceListId: toPriceListId } });
      }
    }
    return { ok: true, count: items.length };
  });
}
