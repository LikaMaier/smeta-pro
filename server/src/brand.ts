import fs from 'node:fs';
import path from 'node:path';

/** Логотип и подпись исполнителя хранятся рядом с фото (на томе Railway) */
export const BRAND_DIR = path.resolve(process.env.PHOTO_DIR || './data/photos', 'brand');

export const brandPath = (file?: string | null) => {
  if (!file) return null;
  const p = path.join(BRAND_DIR, path.basename(file));
  return fs.existsSync(p) ? p : null;
};
