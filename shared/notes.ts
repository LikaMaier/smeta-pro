/**
 * Примечание строки сметы бывает двух видов:
 *  – для заказчика: «минвата в каркас», «слой ~15 мм», «зимние работы ×1,15»;
 *  – служебное, для исполнителя: «Примерная цена — проверьте», «проверьте у своего поставщика»,
 *    «количество типовое — уточните», «Укажите цену».
 * Служебное видит только исполнитель в приложении. В документы заказчика (PDF, ссылка, акт, договор, Excel)
 * оно не попадает: заказчику незачем читать «проверьте у своего поставщика».
 */
const SERVICE = [
  /^(примерная|ориентировочная)\s+цена/i,
  /^цена\s+примерная/i,
  /^цена\s+материала\s*[—–-]/i,
  /^проверьте\s+у\s+(своего\s+)?поставщика/i,
  /^количество\s+(типовое|не\s+определено)/i,
  /^укажите\s+цену/i,
];

/** Часть примечания — служебная пометка для исполнителя */
export const isServiceNote = (part: string) => SERVICE.some((re) => re.test(part.trim()));

/** Примечание без служебных пометок — то, что можно показать заказчику (null, если ничего не осталось) */
export function publicNote(note?: string | null): string | null {
  const parts = String(note || '').split(/\s*;\s*|\n+/).map((s) => s.trim()).filter(Boolean).filter((p) => !isServiceNote(p));
  return parts.length ? parts.join('; ') : null;
}

const QTY_NOTE = /^количество\s+(типовое|не\s+определено)/i;
/**
 * Исполнитель сам поправил цену или количество — служебная пометка про них больше не нужна.
 * what: 'price' — убрать «примерная цена…», 'qty' — убрать «количество типовое…».
 */
export function clearServiceNote(note: string | null | undefined, what: 'price' | 'qty'): string {
  return String(note || '').split(/\s*;\s*|\n+/).map((s) => s.trim()).filter(Boolean)
    .filter((p) => !(isServiceNote(p) && (what === 'qty' ? QTY_NOTE.test(p) : !QTY_NOTE.test(p)))).join('; ');
}
/** В примечании остались служебные пометки (цена или количество не проверены) */
export const hasServiceNote = (note?: string | null) => String(note || '').split(/\s*;\s*|\n+/).some((p) => p.trim() && isServiceNote(p));

/**
 * Позиция справочника со стартовой («примерной») ценой — исполнитель её ещё не менял.
 * Признаков исторически два: params.starter и заметка «Примерная цена…»; своя цена снимает оба.
 */
export function isApproxItem(it: { params?: any; notes?: string | null } | null | undefined): boolean {
  if (!it) return false;
  const st = it.params && typeof it.params === 'object' ? (it.params as any).starter : undefined;
  if (st === true) return true;
  if (st === false) return false;
  return /^Примерная цена/.test(it.notes || '');
}
