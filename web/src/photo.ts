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
