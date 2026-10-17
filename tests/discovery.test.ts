import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, parseSaved, type DiscoveryState } from '../src/discovery.ts';
import { ORDERED_SHOPS } from '../src/data/shops.ts';
import { shopListHtml } from '../src/render/templates.ts';
import { TrailPlayer } from '../src/trail.ts';
import { TRAILS } from '../src/data/trails.ts';
const base: DiscoveryState = { query: '', city: 'all', broths: new Set(), saved: new Set(), savedOnly: false, sort: 'guide' };

test('city and broth filters intersect while multiple broths are alternatives', () => {
  assert.equal(discover(ORDERED_SHOPS, {...base, city:'tokyo'}).length, 3);
  const shops = discover(ORDERED_SHOPS, {...base, city:'kyoto', broths:new Set(['miso','shoyu'])});
  assert.deepEqual(shops.map(s => s.slug).sort(), ['honke-daiichi-asahi','kyoto-gogyo']);
  assert.equal(discover(ORDERED_SHOPS, {...base,city:'tokyo',broths:new Set(['miso'])}).length, 0);
});
test('search supports Japanese, whitespace, names and multi-term bowl queries', () => {
  assert.equal(discover(ORDERED_SHOPS, {...base,query:'  TOKYO   shio '})[0]?.slug,'afuri-ebisu');
  assert.equal(discover(ORDERED_SHOPS, {...base,query:'東京'}).length,3);
  assert.equal(discover(ORDERED_SHOPS, {...base,query:'銀座'})[0]?.slug,'ginza-kagari');
});
test('saved collection filters accurately and sorting does not mutate catalog', () => {
  const before = ORDERED_SHOPS.map(s=>s.slug);
  const shops = discover(ORDERED_SHOPS,{...base,savedOnly:true,saved:new Set(['ginza-kagari','afuri-ebisu']),sort:'name'});
  assert.deepEqual(shops.map(s=>s.slug),['afuri-ebisu','ginza-kagari']);
  assert.deepEqual(ORDERED_SHOPS.map(s=>s.slug),before);
});
test('malformed, stale and duplicate saved values cannot corrupt app state', () => {
  const valid = new Set(['a','b']);
  assert.deepEqual([...parseSaved('["a", "a", "unknown", 7, null, "b"]',valid)],['a','b']);
  for(const value of ['bad','{}','null',null]) assert.equal(parseSaved(value,valid).size,0);
});
test('shop content is escaped and bookmarks have independent accessible buttons', () => {
  const shop={...ORDERED_SHOPS[0]!,name:'<script>alert(1)</script>'};
  const html=shopListHtml([shop],shop.slug,new Set([shop.slug]));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /<\/a>\s*<button class="save-shop"/);
  assert.match(html, /aria-pressed="true"/);
});
test('stopping a trail while a camera flight is pending prevents later stops', async () => {
  const visited: string[]=[];
  let finishFlight:()=>void = ()=>{};
  const player = new TrailPlayer({visit: async slug=>{visited.push(slug);await new Promise<void>(r=>{finishFlight=r;});}, announce:()=>{}, onChange:()=>{},cancelFlight:()=>{finishFlight();}});
  const run=player.play(TRAILS[0]!);
  assert.equal(player.playing,true);
  player.stop();await run;
  assert.equal(player.playing,false);
  assert.equal(visited.length,1);
});
