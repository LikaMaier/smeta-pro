import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../env';
import { prisma, HttpError } from '../util';
import { BRAND_DIR, brandPath } from '../brand';
import { meView } from './auth';

/** Логотип и подпись/печать исполнителя: подставляются в смету, акт, договор и на страницу заказчика */
const MAX = 1.5 * 1024 * 1024;
const KIND = z.enum(['logo', 'sign']);
const field = (k: 'logo' | 'sign') => (k === 'logo' ? 'logoFile' : 'signFile');

const sign = (file: string, exp: number | string) => crypto.createHmac('sha256', env.SESSION_SECRET || 'dev-secret').update(`brand:${file}:${exp}`).digest('base64url');
export function brandUrl(file?: string | null) {
  if (!file || !brandPath(file)) return null;
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  return `/files/brand/${file}?exp=${exp}&sig=${sign(file, exp)}`;
}

export async function brandRoutes(app: FastifyInstance) {
  await fs.mkdir(BRAND_DIR, { recursive: true }).catch((e) => app.log.error({ err: e }, 'Нет доступа к папке логотипов'));

  app.post('/api/me/brand/:kind', async (req) => {
    const kind = KIND.parse((req.params as any).kind);
    const { image } = z.object({ image: z.string() }).parse(req.body);
    const m = /^data:image\/png;base64,(.+)$/.exec(image);
    if (!m) throw new HttpError(400, 'Нужна картинка PNG');
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > MAX) throw new HttpError(413, 'Картинка слишком большая');
    if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) throw new HttpError(400, 'Файл не похож на PNG');
    const file = `${req.user.id}-${kind}-${crypto.randomBytes(6).toString('hex')}.png`;
    await fs.writeFile(path.join(BRAND_DIR, file), buf);
    const old = (req.user as any)[field(kind)];
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { [field(kind)]: file } });
    if (old) await fs.unlink(path.join(BRAND_DIR, path.basename(old))).catch(() => {});
    return meView(user);
  });

  app.delete('/api/me/brand/:kind', async (req) => {
    const kind = KIND.parse((req.params as any).kind);
    const old = (req.user as any)[field(kind)];
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { [field(kind)]: null } });
    if (old) await fs.unlink(path.join(BRAND_DIR, path.basename(old))).catch(() => {});
    return meView(user);
  });

  app.get('/files/brand/:file', async (req, reply) => {
    const file = path.basename(String((req.params as any).file));
    const { exp, sig } = req.query as any;
    if (!exp || !sig || Number(exp) < Date.now() / 1000) return reply.status(403).send();
    const e = sign(file, exp);
    if (e.length !== String(sig).length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(String(sig)))) return reply.status(403).send();
    const p = brandPath(file);
    if (!p) return reply.status(404).send();
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'private, max-age=3600').send(await fs.readFile(p));
  });
}
