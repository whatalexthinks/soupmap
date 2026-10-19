import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCommunity,type CommunityEnv} from '../server/community.ts';
let sqlite:DatabaseSync;
let env:CommunityEnv;
const secret='test-moderator-token-at-least-32-characters';
beforeEach(()=>{
  sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_community.sql',import.meta.url),'utf8'));
  env={COMMUNITY_ADMIN_TOKEN:secret,COMMUNITY_DB:{prepare(sql:string){
    let values:unknown[]=[];
    const statement={bind(...v:unknown[]){values=v;return statement;},async first<T>(){return (sqlite.prepare(sql).get(...values as [])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as []) as T[]};},async run(){return sqlite.prepare(sql).run(...values as []);}};
    return statement;
  }}};
});
afterEach(()=>sqlite.close());
const note={shop:'afuri-ebisu',city:'Tokyo',kind:'tip',body:'Buy a ticket before joining the queue.',author:'Alex',date:'2026-01-15',consent:true};
async function request(action:string,data?:unknown,admin=false,extra:Record<string,string>={}){
  return handleCommunity(new Request(`https://soupmap.example/api/community?action=${action}`,{method:data?'POST':'GET',headers:{'content-type':'application/json','origin':'https://soupmap.example',...(admin?{authorization:`Bearer ${secret}`} : {}),...extra},...(data?{body:JSON.stringify(data)}:{})}),env);
}
test('unconfigured backend reports unavailable and never claims a submission succeeded',async()=>{
  const response=await handleCommunity(new Request('https://soupmap.example/api/community?action=status'),{});
  assert.deepEqual(await response.json(),{enabled:false});
  const r=await handleCommunity(new Request('https://soupmap.example/api/community?action=submit',{method:'POST'}),{});assert.equal(r.status,503);
});
test('submitted notes stay private until authenticated approval and status receipt stays private',async()=>{
  const submitted=await request('submit',note);assert.equal(submitted.status,201);
  const receipt=await submitted.json() as {id:string;token:string};
  assert.deepEqual(await (await request('notes&shop=afuri-ebisu')).json(),[]);
  assert.equal((await request('queue')).status,401);
  const queue=await (await request('queue',undefined,true)).json() as Record<string,unknown>[];
  assert.equal(queue.length,1);assert.ok(!('receipt_hash'in queue[0]!));
  assert.equal((await request('receipt',{id:receipt.id,token:'x'.repeat(72)})).status,404);
  assert.deepEqual(await (await request('receipt',receipt)).json(),{status:'pending'});
  const review=await request('review',{id:receipt.id,status:'approved',expected:'pending'},true);assert.equal(review.status,200);
  const publicNotes=await (await request('notes&shop=afuri-ebisu')).json() as Record<string,unknown>[];
  assert.equal(publicNotes.length,1);assert.equal(publicNotes[0]?.author,'Alex');assert.ok(!('receipt_hash'in publicNotes[0]!));
  assert.deepEqual(await (await request('receipt',receipt)).json(),{status:'approved'});
  assert.equal((await request('review',{id:receipt.id,status:'rejected',expected:'pending'},true)).status,409);
  await request('review',{id:receipt.id,status:'rejected',expected:'approved'},true);
  assert.deepEqual(await (await request('notes&shop=afuri-ebisu')).json(),[]);
});
test('server rejects missing consent, invalid shop, unsafe map URL, undated observations, cross-origin writes',async()=>{
  for(const data of [{...note,consent:false},{...note,shop:'fake'},{...note,body:'tiny'},{...note,kind:'observation',date:''},{...note,kind:'place',placeName:'New bowl',mapUrl:'javascript:alert(1)'}])assert.equal((await request('submit',data)).status,400);
  assert.equal((await request('submit',note,false,{origin:'https://evil.example'})).status,403);
});
test('rate limit is enforced in SQL even with concurrent submissions',async()=>{
  const results=await Promise.all(Array.from({length:8},()=>request('submit',note)));
  assert.equal(results.filter(r=>r.status===201).length,5);assert.equal(results.filter(r=>r.status===429).length,3);
});
test('approved place nominations surface separately and do not fabricate catalog shops',async()=>{
  const response=await request('submit',{...note,kind:'place',shop:'',city:'Nara',placeName:'A submitted place',mapUrl:'https://maps.google.com/?q=Nara'});
  const receipt=await response.json() as {id:string;token:string};assert.equal(response.status,201);
  await request('review',{id:receipt.id,status:'approved',expected:'pending'},true);
  const places=await (await request('places')).json() as Record<string,unknown>[];
  assert.equal(places.length,1);assert.equal(places[0]?.city,'Nara');assert.equal(places[0]?.shop,'');
  assert.deepEqual(await (await request('coverage')).json(),[]);
});
test('oversized and malformed input is rejected before storage',async()=>{
  assert.equal((await request('submit',{...note,body:'a'.repeat(10000)})).status,400);
  const response=await handleCommunity(new Request('https://soupmap.example/api/community?action=submit',{method:'POST',headers:{'content-type':'application/json'},body:'{'}),env);
  assert.equal(response.status,400);
});
