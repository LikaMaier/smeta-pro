/** Один вход для всех видов проектов: навесы и строения, заборы, план участка */
import { buildCanopy } from './canopy';
import { buildFence } from './fence3d';
import { buildSite } from './site';
import { buildMep } from './mep';
import type { DesignPrices } from './prices';

export type DesignKind = 'canopy' | 'fence' | 'site' | 'mep';
export const designKindOf = (p: any): DesignKind => (p?.kind === 'fence' ? 'fence' : p?.kind === 'site' ? 'site' : p?.kind === 'mep' ? 'mep' : 'canopy');

export function buildDesign(p: any, own?: Partial<DesignPrices> | null) {
  const k = designKindOf(p);
  if (k === 'fence') return buildFence(p);
  if (k === 'site') return buildSite(p);
  if (k === 'mep') return buildMep(p);
  return buildCanopy(p, own);
}
export type DesignResult = ReturnType<typeof buildDesign>;
