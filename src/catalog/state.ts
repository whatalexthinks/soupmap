import { discover, type SortOrder } from '../discovery.ts';
import { isEditorial } from '../data/indexation.ts';
import { CITIES } from '../data/cities.ts';
import { CUISINES, type CuisineId } from '../cuisines.ts';
import type { Shop } from '../data/schema.ts';

export interface DirectoryState {
  query: string; city: string; cuisine: CuisineId | 'all';
  collection: 'all' | 'editorial' | 'saved'; sort: SortOrder; hideChains: boolean; page: number;
}
export const DIRECTORY_PAGE_SIZE = 24;
export function directoryState(url: URL, city = 'all', page = 1): DirectoryState {
  const q = url.searchParams;
  return {query:(q.get('q') ?? '').slice(0,100), city:CITIES.some(c=>c.slug === q.get('city')) ? q.get('city')! : q.get('city') === 'all' ? 'all' : city,
    cuisine:CUISINES.some(c=>c.id === q.get('cuisine')) ? q.get('cuisine') as CuisineId : 'all',
    collection:q.get('collection') === 'saved' ? 'saved' : q.get('collection') === 'editorial' ? 'editorial' : 'all',
    sort:q.get('sort') === 'name' ? 'name' : 'guide', hideChains:q.get('independent') === '1',
    page:Math.max(1,Math.min(10000,Math.floor(Number(q.get('p') ?? page)) || 1))};
}
export function directoryUrl(state: DirectoryState, baseCity: string, current: URL): URL {
  const url = new URL('/catalog/',current.origin);
  if(baseCity !== 'all' && state.city === baseCity) url.pathname = `/city/${baseCity}/`;
  if(state.query)url.searchParams.set('q',state.query);
  if(state.city !== baseCity || (baseCity !== 'all' && url.pathname === '/catalog/'))url.searchParams.set('city',state.city);
  if(state.cuisine !== 'all')url.searchParams.set('cuisine',state.cuisine);
  if(state.collection !== 'all')url.searchParams.set('collection',state.collection);
  if(state.sort === 'name')url.searchParams.set('sort','name');
  if(state.hideChains)url.searchParams.set('independent','1');
  if(state.page > 1)url.searchParams.set('p',String(state.page));
  if(current.searchParams.has('place'))url.searchParams.set('place',current.searchParams.get('place')!);
  return url;
}
export function directoryResults(shops: readonly Shop[], state: DirectoryState, saved: ReadonlySet<string>, origin?: {lat:number;lng:number}): Shop[] {
  return discover(state.collection === 'editorial' ? shops.filter(isEditorial) : shops, {
    query:state.query,city:state.city,cuisine:state.cuisine,sort:state.sort,hideChains:state.hideChains,
    savedOnly:state.collection === 'saved',saved,broths:new Set(),origin,
  });
}
