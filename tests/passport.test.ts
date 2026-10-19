import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVisits,achievements,passportStats,localDate,type Visits} from '../src/passport.ts';
import {HUBS,collectionUrl,collectionFromUrl} from '../src/data/hubs.ts';
import {shopBySlug} from '../src/data/shops.ts';
const visit={date:'2026-01-15',bowl:'Shio',note:'Private memory',wouldReturn:true};
test('passport rejects unknown shops, malformed dates, future dates and malformed storage',()=>{
  const raw={'afuri-ebisu':visit,'unknown-shop':visit,'ginza-kagari':{...visit,date:'2026-02-30'},'rokurinsha-tokyo-station':{...visit,date:'2999-01-01'}};
  assert.deepEqual(parseVisits(JSON.stringify(raw)),{'afuri-ebisu':visit});
  for(const s of ['[]','null','"bad"','{'])assert.deepEqual(parseVisits(s),{});
});
test('passport computes six achievements from unique visits and accepted contributions',()=>{
  const visits:Visits=Object.fromEntries(HUBS[0]!.stops.map(slug=>[slug,visit]));
  const earned=achievements(visits,1).filter(a=>a.unlocked).map(a=>a.id);
  assert.deepEqual(earned,['first','tokyo','styles','chapter','helpful']);
  assert.deepEqual(passportStats(visits),{bowls:3,cities:1,styles:3,favorites:3});
  assert.equal(achievements({},0).some(a=>a.unlocked),false);
});
test('hub definitions resolve to real shops and match their city',()=>{
  for(const hub of HUBS){assert.ok(hub.stops.length>=2);assert.equal(new Set(hub.stops).size,hub.stops.length);for(const slug of hub.stops)assert.ok(shopBySlug.has(slug));}
});
test('collection links round-trip without private passport data and reject unknown slugs',()=>{
  const url=new URL(collectionUrl('https://example.com',['afuri-ebisu','afuri-ebisu','ginza-kagari']));
  assert.equal(url.pathname,'/map/');
  assert.deepEqual(collectionFromUrl(url.search,new Set(shopBySlug.keys()))?.slugs,['afuri-ebisu','ginza-kagari']);
  assert.equal(url.search.includes('Private'),false);
  assert.equal(collectionFromUrl('?collection=unknown',new Set(shopBySlug.keys())),null);
  assert.equal(collectionFromUrl('?hub=tokyo-first-bowls',new Set(shopBySlug.keys()))?.hub?.title,'Three sides of Tokyo');
});
test('local stamp dates use the visitor calendar',()=>{const day=localDate(new Date(2026,0,2,0,30));assert.equal(day,'2026-01-02');});
