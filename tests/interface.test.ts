import test, {beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {App} from '../src/app.ts';
import {router} from '../src/router.ts';
import {ORDERED_SHOPS} from '../src/data/shops.ts';
import {discover} from '../src/discovery.ts';
import {ShopCard} from '../src/ui/card.ts';
import {OPEN_SHOPS} from '../src/data/shops.ts';
import {displayName} from '../src/names.ts';
import {cuisineOf} from '../src/cuisines.ts';
import {shortlistHash} from '../src/shortlist.ts';
let window: Window;
let app: App;
beforeEach((context)=>{
  const initialShared = context.name.startsWith('initial shared link');
  window=new Window({url:initialShared
    ? 'https://soupmap.example/' + shortlistHash(['afuri-ebisu','ichiran-nakasu'])
    : 'https://soupmap.example/'});
  if (initialShared) window.localStorage.setItem('soupmap:saved:v1', JSON.stringify(['ginza-kagari']));
  window.document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  for (const key of ['document','location','history','localStorage','CSS','HTMLElement','Element','HTMLInputElement','HTMLButtonElement','navigator']) {
    Object.defineProperty(globalThis,key,{value:(window as unknown as Record<string,unknown>)[key],configurable:true});
  }
  Object.defineProperty(globalThis,'window',{value:window,configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
  Object.defineProperty(globalThis,'getComputedStyle',{value:window.getComputedStyle.bind(window),configurable:true});
  Object.defineProperty(globalThis,'matchMedia',{value:window.matchMedia.bind(window),configurable:true});
  // DOM integration tests intentionally do not initialize WebGL or make network requests.
  Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>0,configurable:true});
  app=new App();app.start();
});
afterEach(async()=>{await window.happyDOM.close();});
const el=(selector:string)=>window.document.querySelector(selector) as unknown as HTMLElement;
const click=(selector:string)=>el(selector).click();
const rows=()=>[...window.document.querySelectorAll<HTMLAnchorElement>('.shop-row')];

test('boots into Tokyo with working city filtering and disabled pending map controls',()=>{
  assert.equal(rows().length,100);
  assert.ok(el('[data-load-more]'));
  assert.equal(el('[data-city="tokyo"]').getAttribute('aria-pressed'),'true');
  assert.ok((el('#zoom-in') as HTMLButtonElement).disabled);
  click('[data-city="fukuoka"]');
  assert.equal(rows().length,100);
  assert.equal(el('#map-city').textContent,'Fukuoka');
  assert.ok(rows().every(r=>r.textContent?.includes('Fukuoka')));
});
test('bookmark survives tab changes, persists to storage, and can be removed',()=>{
  click('[data-save="afuri-ebisu"]');
  assert.equal(el('#saved-count').textContent,'1');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('soupmap:saved:v1')!),['afuri-ebisu']);
  click('#saved-tab');
  assert.equal(rows().length,1);
  click('[data-save="afuri-ebisu"]');
  assert.equal(rows().length,0);
  assert.match(el('#shop-list').textContent ?? '',/room for discovery/);
  assert.equal(el('#saved-count').textContent,'0');
});
test('search Enter flushes debounce before selecting and creates a shareable card',()=>{
  const input=el('#shop-search') as HTMLInputElement;
  input.value='Ginza';
  input.dispatchEvent(new window.Event('input',{bubbles:true}) as unknown as Event);
  input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}) as unknown as Event);
  assert.ok(rows().length >= 1);
  assert.equal(el('#card-title').textContent,'Ginza Kagari Honten');
  assert.equal(window.location.hash,'#ginza-kagari');
  assert.ok(el('[data-action="save"]'));
  click('[data-action="close"]');
  assert.ok(el('#card').hidden);
});
test('changing flavor closes an excluded card, reset recovers all results',()=>{
  click('[data-slug="afuri-ebisu"]');
  click('[data-broth="miso"]');
  assert.equal(rows().length,0);
  assert.ok(el('#card').hidden);
  click('#clear-filters');
  assert.equal(rows().length,100);
  assert.ok(el('[data-load-more]'));
  assert.equal(el('#filter-count').textContent,'All styles');
});
test('card bookmark remains synchronized with collection and cross-tab updates',()=>{
  click('[data-slug="ginza-kagari"]');
  click('[data-action="save"]');
  assert.equal(el('[data-action="save"]').getAttribute('aria-pressed'),'true');
  assert.equal(el('#saved-count').textContent,'1');
  window.localStorage.removeItem('soupmap:saved:v1');
  window.dispatchEvent(new window.StorageEvent('storage',{key:'soupmap:saved:v1'}));
  assert.equal(el('#saved-count').textContent,'0');
  assert.equal(el('[data-action="save"]').getAttribute('aria-pressed'),'false');
});
test('deep-link selection from another city reveals its entry and malformed hash is safe',()=>{
  app.select('ichiran-nakasu',{fly:false,focus:false});
  assert.equal(el('[data-city="fukuoka"]').getAttribute('aria-pressed'),'true');
  assert.ok(rows().some(r=>r.dataset.slug==='ichiran-nakasu'));
  window.history.replaceState(null,'','/#%E0%A4%A');
  assert.equal(router.initial(),null);
});
test('surprise respects visible results and sort order changes without losing saves',()=>{
  const select=el('#shop-sort') as HTMLSelectElement;
  select.value='name';
  select.dispatchEvent(new window.Event('change',{bubbles:true}) as unknown as Event);
  const expected = discover(ORDERED_SHOPS, {query:'',city:'tokyo',broths:new Set(),saved:new Set(),savedOnly:false,sort:'name'});
  assert.equal(rows()[0]?.dataset.slug,expected[0]?.slug);
  click('[data-broth="shio"]');
  click('#surprise-btn');
  assert.equal(el('#card-title').textContent,'AFURI Ebisu');
});

test('pagination expands results and resets when switching cities',()=>{
  assert.equal(rows().length,100);
  click('[data-load-more]');
  assert.equal(rows().length,200);
  click('[data-city="fukuoka"]');
  assert.equal(rows().length,100);
});

test('Street View remains discoverable with useful states and an external fallback',()=>{
  click('[data-slug="afuri-ebisu"]');
  const button=el('[data-action="stand-outside"]') as HTMLButtonElement;
  assert.equal(button.hidden,false);
  assert.ok(button.disabled);
  const external=window.document.querySelector<HTMLAnchorElement>('a[href*="map_action=pano"]');
  assert.ok(external?.href.includes('viewpoint=35.648296,139.710861'));
  const card=new ShopCard({onClose(){},onSave(){},onStandOutside(){},onBuildingInfo(){},onStepInside(){},onCopyLink(){}});
  card.setStreetView('available');
  assert.equal(button.disabled,false);
  card.setStreetView('loading');
  assert.equal(button.getAttribute('aria-busy'),'true');
  card.setStreetView('unavailable','Google denied Street View access.');
  assert.equal(button.hidden,false);
  assert.ok(button.disabled);
  assert.match(el('#street-view-status').textContent ?? '',/Google denied/);
});

test('selecting a nationwide source record reveals its row without rendering the full catalog',()=>{
  const shop=OPEN_SHOPS.find(s=>s.neighborhood==='八重山郡竹富町')!;
  app.select(shop.slug,{fly:false,focus:false});
  assert.equal(el('#card-title').textContent,displayName(shop));
  assert.ok(rows().some(r=>r.dataset.slug===shop.slug));
  assert.equal(rows().length,100);
  assert.match(el('#card').textContent ?? '',/CDLA-Permissive-2.0/);
  assert.match(el('#card').textContent ?? '',/Menu not verified/);
});

test('main style filters real catalog results and reset clears it',()=>{
  const select = el('#cuisine-filter') as HTMLSelectElement;
  select.value='udon';
  select.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.ok(rows().length>0);
  assert.ok(rows().every(r=>cuisineOf(ORDERED_SHOPS.find(s=>s.slug===r.dataset.slug)!)==='udon'));
  click('#clear-filters');
  assert.equal(select.value,'all');
  assert.equal(rows().length,100);
});

test('shop-name language updates rows, cards and persisted preference',()=>{
  const shop=OPEN_SHOPS.find(s=>s.nameRomanized && s.city==='Tokyo')!;
  app.select(shop.slug,{fly:false,focus:false});
  assert.equal(el('#card-title').textContent,shop.nameRomanized);
  const select=el('#name-language') as HTMLSelectElement;
  select.value='ja';
  select.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(el('#card-title').textContent,shop.nameJa);
  assert.equal(window.localStorage.getItem('soupmap:name-language:v1'),'ja');
  select.value='en';
  select.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(el('#card-title').textContent,shop.nameRomanized);
});

test('nearest-me sort changes only after location succeeds and handles denied permission',async()=>{
  const select=el('#shop-sort') as HTMLSelectElement;
  Object.defineProperty(globalThis,'navigator',{value:{geolocation:{
    getCurrentPosition:(_resolve:unknown,reject:(e:unknown)=>void)=>reject({code:1}),
  }},configurable:true});
  select.value='distance';
  select.dispatchEvent(new window.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(select.value,'guide');
  Object.defineProperty(globalThis,'navigator',{value:{geolocation:{
    getCurrentPosition:(resolve:(position:unknown)=>void)=>resolve({coords:{latitude:35.67,longitude:139.76}}),
  }},configurable:true});
  select.value='distance';
  select.dispatchEvent(new window.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(select.value,'distance');
  const expected=discover(ORDERED_SHOPS,{query:'',city:'tokyo',broths:new Set(),savedOnly:false,saved:new Set(),sort:'distance',origin:{lat:35.67,lng:139.76}});
  assert.equal(rows()[0]?.dataset.slug,expected[0]?.slug);
});

test('mobile search dock expands on focus, cycles its handle and restores desktop layout',()=>{
  window.happyDOM.setWindowSize({width:402,height:874});
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(el('#panel').getAttribute('data-snap'),'peek');
  assert.equal(el('#sheet-handle').getAttribute('aria-expanded'),'false');
  assert.equal(el('#panel').style.getPropertyValue('--sheet-h'),'72px');
  (el('#shop-search') as HTMLInputElement).focus();
  assert.equal(el('#panel').getAttribute('data-snap'),'half');
  assert.equal(el('#sheet-handle').getAttribute('aria-expanded'),'true');
  click('#sheet-handle');
  assert.equal(el('#panel').getAttribute('data-snap'),'full');
  click('#sheet-handle');
  assert.equal(el('#panel').getAttribute('data-snap'),'peek');
  click('#saved-tab');
  assert.equal(el('#panel').getAttribute('data-snap'),'half');
  window.happyDOM.setWindowSize({width:1280,height:900});
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(el('#panel').hasAttribute('data-snap'),false);
  assert.equal(el('#panel').style.getPropertyValue('--sheet-h'),'');
});

function openShared(ids: string[]): void {
  window.history.replaceState(null, '', '/' + shortlistHash(ids));
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
}
function chooseShared(id: string): void {
  const input = el(`[data-shortlist-shop][value="${id}"]`) as HTMLInputElement;
  input.checked = !input.checked;
  input.dispatchEvent(new window.Event('change', {bubbles:true}));
}
function assertSavedShopGroup(expectedCount: number): void {
  const group = el('fieldset.shortlist-share__list');
  assert.ok(group, 'shop choices have native fieldset group semantics');
  assert.equal(group.querySelector(':scope > legend')?.textContent, 'Saved soup shops');
  assert.equal(group.querySelectorAll('[data-shortlist-shop]').length, expectedCount);
  for (const input of group.querySelectorAll('[data-shortlist-shop]')) {
    assert.ok(input.closest('label')?.textContent?.trim(), 'each checkbox retains its shop name');
  }
}

test('initial shared link opens the shortlist without importing or replacing saves', () => {
  assert.equal(el('#shared-shortlist').hidden, false);
  assert.deepEqual(rows().map(r => r.dataset.slug), ['afuri-ebisu', 'ichiran-nakasu']);
  assert.deepEqual(JSON.parse(window.localStorage.getItem('soupmap:saved:v1')!), ['ginza-kagari']);
  assert.equal(el('#saved-count').textContent, '1');
  assert.equal(el('#map-city').textContent, 'Earth');
  assert.ok(el('#card').hidden);
});

test('sharing is opt-in and includes only the selected saved shops', () => {
  click('[data-save="afuri-ebisu"]');
  click('[data-save="ginza-kagari"]');
  assert.equal(el('#share-shortlist').hidden, true);
  click('#saved-tab');
  click('#share-shortlist');
  assertSavedShopGroup(2);
  assert.equal(window.document.querySelectorAll('[data-shortlist-shop]:checked').length, 0);
  assert.equal((el('[data-shortlist-generate]') as HTMLButtonElement).disabled, true);
  chooseShared('afuri-ebisu');
  assertSavedShopGroup(2);
  click('[data-shortlist-generate]');
  const link = (el('[data-shortlist-url]') as HTMLInputElement).value;
  const params = new URLSearchParams(new URL(link).hash.slice(1));
  assert.deepEqual(params.getAll('id'), ['afuri-ebisu']);
  assert.ok(!link.includes('ginza-kagari'));
  assert.equal(window.location.hash, '');
  chooseShared('ginza-kagari');
  assert.equal((el('[data-shortlist-url]') as HTMLInputElement).value, '');
  click('[data-shortlist-close]');
  assert.equal(el('#shortlist-share').hidden, true);
  assert.equal(window.document.activeElement?.id, 'share-shortlist');
});

test('share chooser retains its named group when saved shops are removed', () => {
  click('[data-save="afuri-ebisu"]');
  click('#saved-tab');
  click('#share-shortlist');
  assertSavedShopGroup(1);
  window.localStorage.setItem('soupmap:saved:v1', '[]');
  window.dispatchEvent(new window.StorageEvent('storage', {key:'soupmap:saved:v1'}));
  assertSavedShopGroup(0);
  assert.match(el('.shortlist-share__list').textContent!, /No saved shops yet/);
});

test('shared view spans cities and adds individual saves without replacing existing ones', () => {
  click('[data-save="ginza-kagari"]');
  openShared(['afuri-ebisu', 'ichiran-nakasu']);
  assert.deepEqual(rows().map(r => r.dataset.slug), ['afuri-ebisu', 'ichiran-nakasu']);
  assert.equal(el('#shared-tab').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('soupmap:saved:v1')!), ['ginza-kagari']);
  click('[data-save="afuri-ebisu"]');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('soupmap:saved:v1')!), ['ginza-kagari', 'afuri-ebisu']);
  assert.equal(rows().length, 2);
  click('[data-slug="ichiran-nakasu"]');
  assert.ok(window.location.hash.startsWith('#shortlist='));
  assert.equal(router.initial(), 'ichiran-nakasu');
  assert.match(rows()[0].href, /shortlist=/);
  click('[data-action="close"]');
  assert.ok(window.location.hash.startsWith('#shortlist='));
  click('#saved-tab');
  assert.equal(rows().length, 2);
  assert.equal(window.location.hash, '');
  click('#shared-tab');
  assert.deepEqual(rows().map(r => r.dataset.slug), ['afuri-ebisu', 'ichiran-nakasu']);
  click('[data-save="afuri-ebisu"]');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('soupmap:saved:v1')!), ['ginza-kagari']);
});

test('shared view handles missing shops, invalid payloads and preserves the missing notice on return', () => {
  openShared(['gone-shop', 'afuri-ebisu']);
  assert.equal(rows().length, 1);
  assert.match(el('#shared-note').textContent!, /1 shops are no longer available/);
  click('#explore-tab');
  click('#shared-tab');
  assert.match(el('#shared-note').textContent!, /1 shops are no longer available/);
  openShared(['gone-shop']);
  assert.equal(rows().length, 0);
  assert.match(el('#shared-note').textContent!, /0 available/);
  window.history.replaceState(null, '', '/#shortlist=v1' + '&id=afuri-ebisu'.repeat(21));
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.equal(rows().length, 0);
  assert.match(el('#shared-note').textContent!, /too many/);
  click('#explore-tab');
  assert.equal(rows().length, 100);
});

test('share chooser stays bounded, caps selection and follows language and cross-tab removals', () => {
  const ids = ORDERED_SHOPS.slice(0, 220).map(s => s.slug);
  window.localStorage.setItem('soupmap:saved:v1', JSON.stringify(ids));
  window.dispatchEvent(new window.StorageEvent('storage', {key:'soupmap:saved:v1'}));
  click('#saved-tab');
  click('#share-shortlist');
  assert.equal(window.document.querySelectorAll('[data-shortlist-shop]').length, 100);
  for (const id of ids.slice(0,20)) chooseShared(id);
  assert.equal(window.document.querySelectorAll('[data-shortlist-shop]:checked').length, 20);
  assert.equal((el(`[data-shortlist-shop][value="${ids[20]}"]`) as HTMLInputElement).disabled, true);
  click('[data-shortlist-next]');
  assert.equal(window.document.querySelectorAll('[data-shortlist-shop]').length, 100);
  assertSavedShopGroup(100);
  click('[data-shortlist-generate]');
  assert.equal(new URLSearchParams(new URL((el('[data-shortlist-url]') as HTMLInputElement).value).hash.slice(1)).getAll('id').length, 20);
  const language = el('#name-language') as HTMLSelectElement;
  language.value = 'ja';
  language.dispatchEvent(new window.Event('change', {bubbles:true}));
  assertSavedShopGroup(100);
  assert.ok(el('#shortlist-share').textContent!.includes(ORDERED_SHOPS[100].nameJa));
  window.localStorage.setItem('soupmap:saved:v1', JSON.stringify(ids.slice(1)));
  window.dispatchEvent(new window.StorageEvent('storage', {key:'soupmap:saved:v1'}));
  assert.equal((el('[data-shortlist-url]') as HTMLInputElement).value, '');
  assert.equal(el('[data-shortlist-count]').textContent, '19');
});

test('shortlist copy reports clipboard failure and leaves a selectable link', async () => {
  click('[data-save="afuri-ebisu"]');
  click('#saved-tab');
  click('#share-shortlist');
  chooseShared('afuri-ebisu');
  click('[data-shortlist-generate]');
  Object.defineProperty(globalThis, 'navigator', {value:{clipboard:{writeText:async()=>{throw new Error('denied');}}}, configurable:true});
  click('[data-shortlist-copy]');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(el('[data-shortlist-status]').textContent!, /copy it manually/);
  const input = el('[data-shortlist-url]') as HTMLInputElement;
  assert.equal(input.selectionEnd, input.value.length);
});

test('mobile keyboard keeps search usable and collapsing does not reopen the sheet',()=>{
  window.happyDOM.setWindowSize({width:402,height:874});
  const viewport={height:874,offsetTop:0,scale:1};
  Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  window.dispatchEvent(new window.Event('resize'));
  el('#shop-search').focus();
  assert.equal(el('#panel').getAttribute('data-snap'),'half');
  viewport.height=410;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(el('#panel').getAttribute('data-snap'),'full');
  assert.equal(window.document.documentElement.style.getPropertyValue('--viewport-bottom'),'464px');
  assert.ok(parseFloat(el('#panel').style.getPropertyValue('--sheet-h'))<=410);
  viewport.height=874;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(el('#panel').getAttribute('data-snap'),'half');
  viewport.height=410;
  window.dispatchEvent(new window.Event('resize'));
  click('#sheet-handle');
  assert.notEqual(window.document.activeElement,el('#shop-search'));
  viewport.height=874;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(el('#panel').getAttribute('data-snap'),'peek');
});

test('mobile card hides the underlying sheet and restores visible keyboard focus on close',()=>{
  window.happyDOM.setWindowSize({width:402,height:874});
  window.dispatchEvent(new window.Event('resize'));
  el('#shop-search').focus();
  rows()[0]!.click();
  assert.equal(el('#panel').hasAttribute('data-covered'),true);
  assert.equal(el('#panel').inert,true);
  const close=el('#card [data-action="close"]');
  close.focus();close.click();
  assert.equal(el('#panel').hasAttribute('data-covered'),false);
  assert.equal(el('#panel').inert,false);
  assert.equal(window.document.activeElement,el('#sheet-handle'));
});

test('a cancelled sheet drag releases its state and ignores unrelated pointers',()=>{
  window.happyDOM.setWindowSize({width:402,height:874});
  window.dispatchEvent(new window.Event('resize'));
  el('#sheet-handle').dispatchEvent(new window.PointerEvent('pointerdown',{pointerId:3,button:0,clientY:700,bubbles:true}));
  assert.equal(el('#panel').hasAttribute('data-dragging'),true);
  window.dispatchEvent(new window.PointerEvent('pointercancel',{pointerId:4}));
  assert.equal(el('#panel').hasAttribute('data-dragging'),true);
  window.dispatchEvent(new window.PointerEvent('pointercancel',{pointerId:3}));
  assert.equal(el('#panel').hasAttribute('data-dragging'),false);
  assert.equal(el('#panel').getAttribute('data-snap'),'peek');
  click('#sheet-handle');
  assert.equal(el('#panel').getAttribute('data-snap'),'half');
});

test('phone landscape uses the same mobile layout rather than the desktop sidebar',()=>{
  window.happyDOM.setWindowSize({width:844,height:390});
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(el('#panel').getAttribute('data-snap'),'peek');
  click('#sheet-handle');
  assert.equal(el('#panel').getAttribute('data-snap'),'half');
  assert.ok(parseFloat(el('#panel').style.getPropertyValue('--sheet-h'))<390);
});

test('the logo returns home inside the app without restarting the page',()=>{
  openShared(['afuri-ebisu']);
  (el('#shop-search') as HTMLInputElement).value='miso';
  el('#shop-search').dispatchEvent(new window.Event('input'));
  const event=new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});
  el('.brand').dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);
  assert.equal((el('#shop-search') as HTMLInputElement).value,'');
  assert.equal(el('#map-city').textContent,'Earth');
  assert.equal(el('#shared-shortlist').hidden,true);
  assert.equal(window.location.hash,'');
  const newTab=new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true});
  el('.brand').dispatchEvent(newTab);
  assert.equal(newTab.defaultPrevented,false);
});
