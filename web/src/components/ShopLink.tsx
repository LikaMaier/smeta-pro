import React from 'react';
import { petrovichUrl, type PetrovichCity } from '../../../shared/petrovich';
import { tg } from '../tg';

export const shopCity = (): PetrovichCity => { try { return (localStorage.getItem('smeta_shop_city') as PetrovichCity) || 'spb'; } catch { return 'spb'; } };
export const setShopCity = (c: PetrovichCity) => { try { localStorage.setItem('smeta_shop_city', c); } catch { /* */ } };
export const openShop = (name: string) => { const u = petrovichUrl(name, shopCity()); if (tg?.openLink) tg.openLink(u); else window.open(u, '_blank', 'noopener'); };

/** Кнопка «Петрович»: открывает поиск этого материала на petrovich.ru (цена и наличие — на сайте магазина) */
export default function ShopLink({ name, block, label = '🛒 Петрович' }: { name: string; block?: boolean; label?: string }) {
  if (!name?.trim()) return null;
  return (
    <button type="button" className={block ? 'btn block' : 'linklike shop-link'} onClick={(e) => { e.stopPropagation(); e.preventDefault(); openShop(name); }} title="Найти в магазине «Петрович»">
      {label}
    </button>
  );
}
