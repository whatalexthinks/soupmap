import { HUBS } from './data/hubs.ts';
import { shopBySlug } from './data/shops.ts';
export const PASSPORT_KEY = 'soupmap:passport:v1';
export interface Visit { date:string; bowl:string; note:string; wouldReturn:boolean }
export type Visits = Record<string,Visit>;
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) === date && date <= localDate() && date >= '1900-01-01';
}
export function parseVisits(raw: string | null): Visits {
  const result:Visits = {};
  try {
    const parsed:unknown = JSON.parse(raw ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
    for (const [slug,value] of Object.entries(parsed)) {
      if (!shopBySlug.has(slug) || !value || typeof value !== 'object') continue;
      const v = value as Record<string,unknown>;
      if (typeof v.date !== 'string' || !validDate(v.date)) continue;
      result[slug] = {date:v.date,bowl:typeof v.bowl==='string'?v.bowl.slice(0,120):'',note:typeof v.note==='string'?v.note.slice(0,400):'',wouldReturn:v.wouldReturn===true};
    }
  } catch { /* Preserve a usable empty passport when storage is corrupt. */ }
  return result;
}
export interface Achievement { id:string; symbol:string; title:string; detail:string; count:number; target:number; unlocked:boolean }
export function achievements(visits:Visits, acceptedContributions = 0): Achievement[] {
  const shops = Object.keys(visits).flatMap(s => shopBySlug.get(s) ?? []);
  const completed = HUBS.filter(h=>h.stops.every(s=>visits[s])).length;
  const data: [string,string,string,string,number,number][] = [
    ['first','一','First bowl','Visit your first place',shops.length,1],
    ['tokyo','東','A taste of Tokyo','Visit three Tokyo shops',shops.filter(s=>s.city==='Tokyo').length,3],
    ['styles','味','Across the broth spectrum','Try three broth styles',new Set(shops.map(s=>s.broth)).size,3],
    ['cities','旅','A little further','Collect bowls in three cities',new Set(shops.map(s=>s.city)).size,3],
    ['chapter','巡','Chapter complete','Visit every place in a collection',completed,1],
    ['helpful','助','A helpful hand','Have a field note accepted',acceptedContributions,1],
  ];
  return data.map(([id,symbol,title,detail,count,target])=>({id,symbol,title,detail,count:Math.min(count,target),target,unlocked:count>=target}));
}
export function passportStats(visits:Visits) {
  const shops=Object.keys(visits).flatMap(s=>shopBySlug.get(s) ?? []);
  return {bowls:shops.length,cities:new Set(shops.map(s=>s.city)).size,styles:new Set(shops.map(s=>s.broth)).size,favorites:shops.filter(s=>visits[s.slug]?.wouldReturn).length};
}
