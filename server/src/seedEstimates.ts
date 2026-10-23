import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bot } from 'grammy';
import { prisma } from './util';
import { env } from './env';

/**
 * Готовые сметы, подготовленные для администратора (server/seed/*.json):
 * при запуске один раз добавляются в аккаунт администратора и приходят в бот кнопкой «Открыть смету».
 * Повторно не создаются (метка в AppKV), удалённую смету не возвращают.
 */
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');

export async function seedAdminEstimates(bot: Bot | null) {
  if (!fs.existsSync(DIR) || !env.ADMIN_TG_IDS.length) return;
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const s = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    for (const tg of env.ADMIN_TG_IDS) {
      const user = await prisma.user.findUnique({ where: { tgId: BigInt(tg) } });
      if (!user) continue;
      const key = `seed:${s.key}:${user.id}`;
      if (await prisma.appKV.findUnique({ where: { key } })) continue;
      const e = await prisma.estimate.create({
        data: {
          userId: user.id, title: s.title, customer: s.customer, address: s.address, notes: s.notes, status: s.status || 'draft',
          warrantyMonths: s.warrantyMonths ?? 12, validDays: s.validDays ?? 14, paySchedule: s.paySchedule ?? undefined, source: 'manual',
          lines: { create: s.lines.map((l: any, i: number) => ({ position: i, name: l.name, qty: l.qty, unit: l.unit, price: l.price, type: l.type || 'work', category: l.category || null, composition: l.composition || null })) },
        },
      });
      await prisma.appKV.create({ data: { key, value: e.id } });
      console.log(`Смета «${s.title}» добавлена администратору ${tg}`);
      if (bot && env.PUBLIC_URL) {
        await bot.api.sendMessage(tg, `📄 Смета готова и лежит в «Мои сметы»:\n${s.title}`, {
          reply_markup: { inline_keyboard: [[{ text: 'Открыть смету', web_app: { url: `${env.PUBLIC_URL}/estimates/${e.id}` } }]] },
        }).catch(() => {});
      }
    }
  }
}
