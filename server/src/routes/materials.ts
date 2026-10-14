/** Поиск по базе материалов «Петрович» (СПб) — для сметы и справочника */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { materialBase, findMaterials } from '../materialBase';

export async function materialsRoutes(app: FastifyInstance) {
  app.get('/api/materials/search', async (req) => {
    const { q, limit } = z.object({ q: z.string().trim().max(120).default(''), limit: z.coerce.number().int().min(1).max(60).default(30) }).parse(req.query);
    const b = materialBase();
    return { source: b.source, city: b.city, date: b.date, priceKind: b.priceKind, total: b.rows.length, items: q.length >= 2 ? findMaterials(q, limit) : [] };
  });
}
