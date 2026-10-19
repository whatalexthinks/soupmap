/** Collections use existing catalog entries; no invented shops, ratings, or walking times. */
export interface Hub {
  slug: string; title: string; subtitle: string; city: string; kanji: string;
  color: string; description: string; stops: readonly string[];
}
export const HUBS: readonly Hub[] = [
  {slug:'tokyo-first-bowls',title:'Three sides of Tokyo',subtitle:'A first chapter',city:'tokyo',kanji:'東京',color:'#a74732',description:'Citrus-led shio, rich chicken broth, and noodles made for dipping. Three different starting points, spread across the city. Take your time between visits.',stops:['afuri-ebisu','ginza-kagari','rokurinsha-tokyo-station']},
  {slug:'kyoto-beyond-the-postcard',title:'Beyond the postcard',subtitle:'The Kyoto chapter',city:'kyoto',kanji:'京都',color:'#627155',description:'Explore Kyoto through a soy-seasoned bowl, burnt miso, and soba. A collection for separate detours, rather than a single meal.',stops:['honke-daiichi-asahi','kyoto-gogyo','honke-owariya']},
  {slug:'fukuoka-tonkotsu',title:'The tonkotsu chapter',subtitle:'Fukuoka, bowl by bowl',city:'fukuoka',kanji:'福岡',color:'#9b7046',description:'Three expressions of pork-bone broth around Fukuoka. Visit over a few days—or collect them across several trips.',stops:['ganso-nagahamaya','ippudo-daimyo','ichiran-nakasu']},
  {slug:'osaka-slow-comfort',title:'A slower kind of Osaka',subtitle:'Udon & oden',city:'osaka',kanji:'大阪',color:'#577678',description:'Two different kinds of comfort: soft wheat noodles and ingredients simmered in dashi. A small chapter to return to when you want to slow down.',stops:['dotonbori-imai','takoume-honten']},
  {slug:'sapporo-miso',title:'The miso chapter',subtitle:'Two Sapporo detours',city:'sapporo',kanji:'札幌',color:'#9b7332',description:'Follow the miso thread through two Sapporo shops. Keep a note of the bowl you ordered and what you would come back for.',stops:['sumire-susukino','menya-saimi']},
];
export const hubBySlug = new Map(HUBS.map(h => [h.slug,h]));
export function collectionFromUrl(search: string, valid: ReadonlySet<string>): {hub?: Hub; slugs: string[]} | null {
  const params = new URLSearchParams(search);
  const hub = hubBySlug.get(params.get('hub') ?? '');
  if (hub) return {hub, slugs:[...hub.stops]};
  const raw = params.get('collection');
  if (!raw || raw.length > 3000) return null;
  const slugs = [...new Set(raw.split(',').filter(s => valid.has(s)))].slice(0,30);
  return slugs.length ? {slugs} : null;
}
export function collectionUrl(origin: string, slugs: readonly string[], hub?: string): string {
  const url = new URL('/map/',origin);
  if (hub && hubBySlug.has(hub)) url.searchParams.set('hub',hub);
  else url.searchParams.set('collection',[...new Set(slugs)].slice(0,30).join(','));
  return url.href;
}
