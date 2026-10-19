export const NOTE_KINDS = ['order','tip','observation','correction','place'] as const;
export type NoteKind = typeof NOTE_KINDS[number];
export const NOTE_LABELS:Record<NoteKind,string> = {order:'What to order',tip:'Something to know',observation:'A personal observation',correction:'A correction',place:'A missing place'};
export interface Contribution {shop:string;city:string;kind:NoteKind;body:string;author:string;date:string;placeName:string;mapUrl:string}
export interface PublicNote extends Contribution {id:string;createdAt:string}
export interface Receipt {id:string;token:string;status:'pending'|'approved'|'rejected';label:string}
export const DRAFT_KEY='soupmap:field-draft:v1';
export const RECEIPTS_KEY='soupmap:receipts:v1';
export async function communityRequest<T>(action:string, init:RequestInit = {}):Promise<T> {
  const response=await fetch(`/api/community?action=${action}`,{...init,headers:{'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(8000)});
  if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('Public contributions are not connected yet. Your draft stays on this device.');
  const data=await response.json() as T & {error?:string};
  if(!response.ok) throw new Error(data.error ?? 'Could not reach the community guide. Please try again.');
  return data;
}
export function readReceipts():Receipt[] {
  try {
    const raw:unknown=JSON.parse(localStorage.getItem(RECEIPTS_KEY)??'[]');
    if(!Array.isArray(raw))return [];
    return raw.filter((r):r is Receipt=>!!r&&typeof r.id==='string'&&typeof r.token==='string'&&typeof r.label==='string'&&['pending','approved','rejected'].includes(r.status)).slice(-100);
  } catch{return [];}
}
