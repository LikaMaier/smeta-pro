/**
 * База материалов из прайс-листа «Петрович» (Санкт-Петербург): загрузка и поиск.
 * Файл server/data/petrovich-spb.json.gz — выгрузка прайса, загружается один раз при первом обращении.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { normText, searchMaterials, packArea } from '../../shared/materialSearch';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/petrovich-spb.json.gz');
type Row = { n: string; name: string; unit: string; price: number; cat: string; code: string };
let base: { source: string; city: string; date: string; priceKind: string; rows: Row[] } | null = null;

export function materialBase() {
  if (base) return base;
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString('utf8'));
  base = {
    source: d.source, city: d.city, date: d.date, priceKind: d.priceKind,
    rows: d.items.map(([name, unit, price, ci, code]: any[]) => ({ n: normText(name), name, unit, price, cat: d.cats[ci], code })),
  };
  return base;
}

/** Найти материалы: [{ name, unit, price, cat, code, perM2 }] */
export function findMaterials(q: string, limit = 30) {
  const b = materialBase();
  return searchMaterials(b.rows, q, limit).map(({ name, unit, price, cat, code }) => {
    const a = packArea(name);
    return { name, unit, price, cat, code, perM2: a ? Math.round((price / a) * 100) / 100 : null };
  });
}

