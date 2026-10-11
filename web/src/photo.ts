/** Сжатие фото на телефоне перед отправкой: экономит трафик и место на сервере */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть фото')); };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, max: number, quality: number): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

export async function preparePhoto(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Это не изображение');
  const img = await loadImage(file);
  return { image: draw(img, 1600, 0.82), thumb: draw(img, 420, 0.7) };
}

/**
 * Логотип и подпись для документов → PNG.
 * Для подписи убираем белый фон бумаги, чтобы она легла поверх линии в договоре и акте.
 */
export async function prepareBrand(file: File, kind: 'logo' | 'sign') {
  if (!file.type.startsWith('image/')) throw new Error('Это не изображение');
  const img = await loadImage(file);
  const max = kind === 'logo' ? 600 : 800;
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  if (kind === 'sign') {
    const d = ctx.getImageData(0, 0, w, h);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      // светлее 205 — фон (прозрачный), 150–205 — мягкий край, темнее — чернила
      const a = lum >= 205 ? 0 : lum <= 150 ? 255 : Math.round(((205 - lum) / 55) * 255);
      px[i + 3] = Math.min(px[i + 3], a);
    }
    ctx.putImageData(d, 0, 0);
    trim(c);
  }
  const out = (kind === 'sign' ? trim(c) : c).toDataURL('image/png');
  if (out.length > 1.9e6) throw new Error('Картинка слишком большая — попробуйте другое фото');
  return out;
}

/** Обрезка прозрачных полей вокруг подписи */
function trim(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d')!;
  const { width: w, height: h } = c;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('На фото не видно подписи — снимите на белом листе крупнее');
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const o = document.createElement('canvas');
  o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
