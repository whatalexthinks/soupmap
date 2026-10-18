import { z } from 'zod';
import { NOTE_KINDS } from '../src/community.ts';
import { shopBySlug } from '../src/data/shops.ts';
import { validDate } from '../src/passport.ts';
interface Statement {
  bind(...values:unknown[]):Statement;
  first<T=Record<string,unknown>>():Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<{results:T[]}>;
  run():Promise<unknown>;
}
export interface CommunityEnv {
  COMMUNITY_DB?:{prepare(sql:string):Statement};
  COMMUNITY_ADMIN_TOKEN?:string;
}
const Input=z.object({
  shop:z.string().max(100).default(''),city:z.string().trim().min(1).max(80),kind:z.enum(NOTE_KINDS),
  body:z.string().trim().min(15).max(600),author:z.string().trim().max(40).default(''),
  date:z.string().default(''),placeName:z.string().trim().max(100).default(''),mapUrl:z.string().max(1000).default(''),
  consent:z.literal(true),website:z.string().max(200).default(''),
});
function json(data:unknown,status=200):Response {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
async function digest(value:string):Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function body(request:Request):Promise<unknown> {
  if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('JSON required');
  const reader=request.body?.getReader(); if(!reader)throw new Error('Empty body');
  let size=0;const chunks:Uint8Array[]=[];
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new Error('Body too large');}chunks.push(value);} }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
const columns='id,shop,city,kind,body,author,visit_date AS date,place_name AS placeName,map_url AS mapUrl,created_at AS createdAt';
export async function handleCommunity(request:Request,env:CommunityEnv):Promise<Response> {
  const url=new URL(request.url);const action=url.searchParams.get('action')??'status';
  const db=env.COMMUNITY_DB;const admin=env.COMMUNITY_ADMIN_TOKEN;
  const configured=!!db&&!!admin&&admin.length>=32;
  if(!configured)return action==='status'?json({enabled:false}):json({error:'Public contributions are not connected yet. Save a draft and return later.'},503);
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return json({error:'Cross-origin requests are not supported.'},403);
  try {
    if(action==='status'&&request.method==='GET'){
      await db!.prepare('SELECT id FROM contributions LIMIT 1').first();
      return json({enabled:true});
    }
    if(action==='notes'&&request.method==='GET'){
      const shop=url.searchParams.get('shop')??'';
      if(!shopBySlug.has(shop))return json({error:'Unknown shop.'},400);
      return json((await db!.prepare(`SELECT ${columns} FROM contributions WHERE shop=? AND status='approved' AND kind!='place' ORDER BY created_at DESC LIMIT 30`).bind(shop).all()).results);
    }
    if(action==='coverage'&&request.method==='GET')return json((await db!.prepare("SELECT shop,kind,COUNT(*) AS count FROM contributions WHERE status='approved' AND kind!='place' GROUP BY shop,kind").all()).results);
    if(action==='places'&&request.method==='GET')return json((await db!.prepare(`SELECT ${columns} FROM contributions WHERE status='approved' AND kind='place' ORDER BY created_at DESC LIMIT 30`).all()).results);
    if(action==='submit'&&request.method==='POST'){
      const parsed=Input.safeParse(await body(request));
      if(!parsed.success)return json({error:'Add a 15–600 character note, valid city, and consent to publish.'},400);
      const n=parsed.data;
      if(n.website)return json({error:'Submission could not be accepted.'},400);
      if(n.date&&!validDate(n.date))return json({error:'Choose a valid date, today or earlier.'},400);
      if(n.kind==='observation'&&!n.date)return json({error:'Add the date of your observation.'},400);
      if(n.kind==='place'){
        if(n.placeName.length<2)return json({error:'Add the name of the place.'},400);
        try { const link=new URL(n.mapUrl);if(link.protocol!=='https:'||!['www.google.com','google.com','maps.google.com','maps.app.goo.gl','goo.gl','www.openstreetmap.org','openstreetmap.org'].includes(link.hostname))throw Error(); }
        catch{return json({error:'Use an HTTPS Google Maps or OpenStreetMap link.'},400);}
        n.shop='';
      } else {
        const shop=shopBySlug.get(n.shop);if(!shop)return json({error:'Choose a shop from the guide.'},400);
        n.city=shop.city;n.placeName='';n.mapUrl='';
      }
      const hour=Math.floor(Date.now()/3600000);
      const bucket=await digest(`${admin}:${request.headers.get('cf-connecting-ip')??'local'}:${hour}`);
      const allowance=await db!.prepare('INSERT INTO contribution_limits(bucket,count,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<5 RETURNING count').bind(bucket,(hour+2)*3600000).first();
      if(!allowance)return json({error:'You have sent five notes this hour. Please come back a little later.'},429);
      const id=crypto.randomUUID();const token=crypto.randomUUID()+crypto.randomUUID();
      await db!.prepare('INSERT INTO contributions(id,receipt_hash,shop,city,kind,body,author,visit_date,place_name,map_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id,await digest(token),n.shop,n.city,n.kind,n.body,n.author||'Anonymous traveler',n.date,n.placeName,n.mapUrl,new Date().toISOString()).run();
      await db!.prepare('DELETE FROM contribution_limits WHERE expires<?').bind(Date.now()).run();
      return json({id,token,status:'pending'},201);
    }
    if(action==='receipt'&&request.method==='POST'){
      const input=z.object({id:z.string().uuid(),token:z.string().min(32).max(100)}).safeParse(await body(request));
      if(!input.success)return json({error:'Invalid receipt.'},400);
      const row=await db!.prepare('SELECT status FROM contributions WHERE id=? AND receipt_hash=?').bind(input.data.id,await digest(input.data.token)).first();
      return row?json(row):json({error:'Receipt not found.'},404);
    }
    if(action==='queue'||action==='review'){
      const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
      if(await digest(supplied)!==await digest(admin!))return json({error:'Moderator access required.'},401);
      if(action==='queue'&&request.method==='GET')return json((await db!.prepare(`SELECT ${columns},status FROM contributions ORDER BY created_at DESC LIMIT 200`).all()).results);
      if(action==='review'&&request.method==='POST'){
        const parsed=z.object({id:z.string().uuid(),status:z.enum(['approved','rejected']),expected:z.enum(['pending','approved','rejected'])}).safeParse(await body(request));
        if(!parsed.success)return json({error:'Invalid review.'},400);
        const n=parsed.data;
        const changed=await db!.prepare('UPDATE contributions SET status=?,reviewed_at=? WHERE id=? AND status=? RETURNING id,status').bind(n.status,new Date().toISOString(),n.id,n.expected).first();
        return changed?json(changed):json({error:'This entry changed. Refresh the queue before reviewing.'},409);
      }
    }
    return json({error:'Unknown action or method.'},404);
  } catch(error) {
    if(error instanceof SyntaxError || (error instanceof Error && ['JSON required','Empty body','Body too large'].includes(error.message)))return json({error:'Invalid request body.'},400);
    return json({error:'The community guide is temporarily unavailable. Your local draft is safe.'},503);
  }
}
