import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { CURATED_SHOPS, OPEN_SHOPS } from '../src/data/shops.ts';
import { restaurantSchema, absoluteSchema } from '../src/growth/schema.ts';
import { COMMERCE, isFeatured, trackedUrl } from '../src/growth/config.ts';
import { badgeDetails, badgeSvg } from '../src/growth/badge.ts';
import { robotsText } from '../src/growth/crawlers.ts';
import { validateCommerce } from '../scripts/lib/validate-commerce.ts';
import { growthPublicApi, growthAccountApi } from '../server/growth-api.ts';
import { GrowthStore } from '../server/growth-store.ts';
import { WeatherService, soupScore } from '../server/weather.ts';
import { apiProtection } from '../server/protection.ts';
const place=CURATED_SHOPS[0]!;

test('restaurant markup preserves sourced facts and never manufactures ratings or menu items',()=>{
  const thin=restaurantSchema(OPEN_SHOPS[0]!);assert.equal(thin['@type'],'Restaurant');assert.ok(!thin.hasMenu&&!thin.aggregateRating);
  const rich=absoluteSchema(restaurantSchema(place),'https://soupmap.com') as any;
  assert.equal(rich.geo.latitude,place.lat);assert.equal(rich.hasMenu.hasMenuItem.name,place.signatureBowl);
  assert.equal(rich.url,`https://soupmap.com/catalog/${place.slug}/`);assert.ok(!rich.aggregateRating);
  COMMERCE.push({slug:place.slug,rating:{value:4.5,count:8,source:'https://soupmap.com/ratings/source',checkedAt:'2026-10-27'}});
  try{assert.equal((restaurantSchema(place).aggregateRating as any).ratingCount,8);}finally{COMMERCE.pop();}
});
test('commercial publication requires valid data; ads cannot award themselves a ranking',()=>{
  validateCommerce();assert.throws(()=>validateCommerce({listings:[{slug:place.slug,featuredUntil:'2027-01-01T00:00:00Z'}],affiliates:[]}));
  assert.throws(()=>validateCommerce({listings:[{slug:place.slug,orderUrl:'javascript:alert(1)'}],affiliates:[]}));
  COMMERCE.push({slug:place.slug,verifiedOwner:true,featuredUntil:'2027-01-01T00:00:00Z'});
  try{assert.equal(isFeatured(place.slug,Date.parse('2026-12-01')),true);assert.equal(isFeatured(place.slug,Date.parse('2027-02-01')),false);
    assert.doesNotMatch(badgeDetails(place).label,/Top|Ranked/);assert.doesNotMatch(badgeDetails(place).embed,/nofollow|sponsored/);
    assert.match(badgeSvg(place),/Verified restaurant/);
  }finally{COMMERCE.pop();}
  assert.equal(trackedUrl('javascript:alert(1)'),null);assert.equal(trackedUrl('https://user:pass@example.com'),null);
  const link=new URL(trackedUrl('https://partner.example/order?affiliate=abc')!);assert.equal(link.searchParams.get('affiliate'),'abc');assert.equal(link.searchParams.get('utm_source'),'soupmap.com');
});
test('crawler policy preserves search access while protecting all API paths',()=>{
  const robots=robotsText('https://soupmap.com');
  for(const bot of ['Googlebot','Bingbot','Applebot','OAI-SearchBot','ChatGPT-User','PerplexityBot','Bytespider','CCBot','Diffbot'])assert.ok(robots.includes(`User-agent: ${bot}`));
  assert.match(robots,/Sitemap: https:\/\/soupmap.com\/sitemap.xml/);
  assert.equal((robots.match(/Disallow: \/api\//g)??[]).length,10);
});
test('weather coalesces concurrent requests, shares rounded location cache, and rejects stale data',async()=>{
  const now=Date.parse('2026-10-27T12:00:00Z');let calls=0;
  const fetcher=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({current:{temperature_2m:10,precipitation:1,weather_code:61,time:now/1000}});};
  const service=new WeatherService(fetcher as typeof fetch,()=>now);
  const results=await Promise.all(Array.from({length:20},()=>service.current(35.65,139.71)));
  assert.equal(calls,1);assert.equal(results[0]!.score,9.4);await service.current(35.65,139.72);assert.equal(calls,1);
  assert.ok(soupScore(-40,10)<=10);assert.ok(soupScore(45,0)>=1);
  const stale=new WeatherService((async()=>Response.json({current:{temperature_2m:10,precipitation:1,weather_code:61,time:0}})) as typeof fetch,()=>now);
  await assert.rejects(stale.current(35,139),/Stale/);
});
test('public capture validates and records leads/claims; passport isolates owners and retries failures honestly',async()=>{
  const leads:any[]=[];const claims:any[]=[];const stamps=new Map<string,Set<string>>();let fail=false;let sent=false;
  const store={lead:async(input:any)=>{if(fail)throw Error();leads.push(input);return{id:'one',status:'queued'};},claim:async(input:any)=>{claims.push(input);},
    visits:async(owner:string)=>[...(stamps.get(owner)??[])],visit:async(owner:string,slug:string,tried:boolean)=>{if(fail)throw Error();const set=stamps.get(owner)??new Set<string>();tried?set.add(slug):set.delete(slug);stamps.set(owner,set);}} as unknown as GrowthStore;
  const app=express();app.use(express.json());app.use('/api',apiProtection());
  app.use('/api/growth',growthPublicApi(store,undefined,async()=>sent));app.use('/api/passport',growthAccountApi(store,req=>req.get('x-test-owner')??null));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  async function req(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
    const response=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  }
  try{
    const input={email:'traveler@example.com',shop:place.slug,city:'Wrong city',marketing:false};
    assert.equal((await req('/growth/leads','POST',input,{origin:'https://evil.example'})).status,403);
    assert.equal((await req('/growth/leads','POST',{...input,website:'spam'})).status,400);
    assert.equal((await req('/growth/leads','POST',{...input,email:'invalid'})).status,400);
    const accepted=await req('/growth/leads','POST',input);assert.equal(accepted.status,202);assert.equal(accepted.data.status,'queued');assert.equal(leads[0].city,place.city);assert.equal(leads[0].marketing,false);
    sent=true;assert.equal((await req('/growth/leads','POST',input)).data.status,'sent');
    fail=true;assert.equal((await req('/growth/leads','POST',input)).status,503);fail=false;
    const claim={shop:place.slug,name:'Restaurant Owner',role:'Manager',email:'owner@example.com',phone:'+81 90 1234 5678',badge:true,featured:true,consent:true};
    assert.equal((await req('/growth/claims','POST',{...claim,consent:false})).status,400);
    assert.equal((await req('/growth/claims','POST',claim)).data.status,'pending');assert.equal(claims.length,1);assert.ok(!claims[0].verified);
    assert.equal((await req('/passport')).status,401);
    assert.equal((await req('/passport/'+place.slug,'PUT',{tried:true},{'x-test-owner':'alice'})).status,200);
    await req('/passport/'+place.slug,'PUT',{tried:true},{'x-test-owner':'alice'});
    const alice=(await req('/passport','GET',undefined,{'x-test-owner':'alice'})).data;assert.deepEqual(alice.visits,[place.slug]);assert.equal(alice.cities[place.city],1);
    assert.deepEqual((await req('/passport','GET',undefined,{'x-test-owner':'bob'})).data.visits,[]);
    assert.equal((await req('/passport/no-such-shop','PUT',{tried:true},{'x-test-owner':'alice'})).status,400);
    fail=true;assert.equal((await req('/passport/'+place.slug,'PUT',{tried:false},{'x-test-owner':'alice'})).status,503);fail=false;
    await req('/passport/'+place.slug,'PUT',{tried:false},{'x-test-owner':'alice'});assert.equal(stamps.get('alice')!.size,0);
    assert.equal((await req('/growth/place/'+place.slug,'GET',undefined,{'User-Agent':'CCBot'})).status,403);
    assert.equal((await req('/growth/weather?lat=NaN&lng=139')).status,400);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('API limits cannot be bypassed by rotating a supplied forwarded header',async()=>{
  const app=express();app.use(apiProtection());app.get('/',(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{const url=`http://127.0.0.1:${(server.address() as any).port}`;
    for(let i=0;i<120;i++)assert.equal((await fetch(url,{headers:{'X-Forwarded-For':`1.2.3.${i}`}})).status,200);
    const limited=await fetch(url);assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
