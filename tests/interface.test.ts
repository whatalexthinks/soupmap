import { siteHeader } from "../src/render/shell.ts";
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
import {setAccountSaved} from '../src/personal-saves.ts';
import {fakeAccount, restoreFetch, settle} from './fake-account.ts';
let window: Window;
let app: App;
beforeEach((context)=>{
  const initialShared = context.name.startsWith('initial shared link');
  const dashboardLink = context.name.startsWith('dashboard link');
  window=new Window({url:initialShared
    ? 'https://soupmap.example/' + shortlistHash(['afuri-ebisu','ichiran-nakasu'])
    : dashboardLink ? 'https://soupmap.example/map/?open=passport' : 'https://soupmap.example/'});
  if (initialShared) window.localStorage.setItem('soupmap:saved:v1', JSON.stringify(['ginza-kagari']));
  window.document.write(readFileSync(new URL('../map/index.html',import.meta.url),'utf8').replace('<!--soupmap:header:map-->',siteHeader('map','map-account')));
  for (const key of ['Event','document','location','history','localStorage','CSS','HTMLElement','Element','HTMLInputElement','HTMLButtonElement','navigator']) {
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
afterEach(async()=>{setAccountSaved(null);restoreFetch();await window.happyDOM.close();});
const el=(selector:string)=>window.document.querySelector(selector) as unknown as HTMLElement;
const click=(selector:string)=>el(selector).click();
const rows=()=>[...window.document.querySelectorAll<HTMLAnchorElement>('.shop-row')];

function analyticsEvents() {
  const events: {name:string; data:Record<string,string|number|boolean>}[]=[];
  Object.defineProperty(window,"umami",{configurable:true,value:{
    track:(name:string,data:Record<string,string|number|boolean>={})=>{events.push({name,data});},
  }});
  return events;
}

test('analytics counts actual shop opens, save changes, filters and directions without shop IDs',async()=>{
  fakeAccount();
  const events=analyticsEvents();
  click('[data-slug="afuri-ebisu"]');
  app.select('afuri-ebisu',{fly:false,focus:false});
  assert.equal(events.filter(e=>e.name==='shop_opened').length,1);
  click('#card [data-action="save"]');await settle();
  click('#card [data-action="save"]');await settle();
  assert.deepEqual(events.filter(e=>e.name==='save_changed').map(e=>e.data.saved),[true,false]);
  const directions=el('#card [data-action="directions"]');
  directions.addEventListener('click',e=>e.preventDefault(),{once:true});
  directions.click();
  assert.equal(events.filter(e=>e.name==='directions_clicked').length,1);
  click('[data-city="fukuoka"]');
  assert.ok(events.some(e=>e.name==='filter_changed' && e.data.value==='fukuoka'));
  assert.ok(!JSON.stringify(events).includes('afuri-ebisu'));
  assert.ok(events.every(e=>/^[a-z_]{1,49}$/.test(e.name)));
});

test('analytics debounces searches and never sends the query text',async()=>{
  const events=analyticsEvents();
  const input=el('#shop-search') as HTMLInputElement;
  input.value='private craving';
  input.dispatchEvent(new window.Event('input',{bubbles:true}) as unknown as Event);
  await new Promise(resolve=>setTimeout(resolve,100));
  input.value='another private craving';
  input.dispatchEvent(new window.Event('input',{bubbles:true}) as unknown as Event);
  await new Promise(resolve=>setTimeout(resolve,800));
  const searches=events.filter(e=>e.name==='search_performed');
  assert.equal(searches.length,1);
  assert.equal(searches[0]?.data.result_count,0);
  assert.ok(!JSON.stringify(events).includes('craving'));
});

test('analytics counts copied shop links only after clipboard success',async()=>{
  const events=analyticsEvents();
  const shop=ORDERED_SHOPS[0]!;
  Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{
    writeText:async()=>{throw new Error('Denied');},
  }});
  await (app as any).copyLink(shop);
  assert.equal(events.length,0);
  Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});
  await (app as any).copyLink(shop);
  assert.equal(events.filter(e=>e.name==='shop_link_copied').length,1);
  assert.ok(!JSON.stringify(events).includes(shop.slug));
});

test('analytics tracks shared-list opens once and distinguishes saves from shared discovery',async()=>{
  fakeAccount();
  const events=analyticsEvents();
  window.history.replaceState(null,'','/'+shortlistHash(['afuri-ebisu']));
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  app.select('afuri-ebisu',{fly:false,focus:false});
  click('#card [data-action="save"]');await settle();
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  assert.equal(events.filter(e=>e.name==='shared_shortlist_opened').length,1);
  assert.ok(events.some(e=>e.name==='save_changed' && e.data.shared_list===true && e.data.saved===true));
  assert.ok(!JSON.stringify(events).includes('afuri-ebisu'));
  assert.ok(!JSON.stringify(events).includes('shortlist='));
});

test('analytics distinguishes successful, unavailable and canceled Street View entries',async()=>{
  const events=analyticsEvents();
  const shop=ORDERED_SHOPS.find(s=>s.slug==='afuri-ebisu')!;
  app.select(shop.slug,{fly:false,focus:false});
  const panorama={open:async():Promise<unknown>=>null,close(){},unavailableReason:()=>''};
  (app as any).streetView=panorama;
  await (app as any).openStreetView(shop);
  assert.equal(events.filter(e=>e.name==='street_view_failed').length,1);
  panorama.open=async()=>({});
  await (app as any).openStreetView(shop);
  assert.equal(events.filter(e=>e.name==='street_view_opened').length,1);
  let finish!:(value:unknown)=>void;
  panorama.open=()=>new Promise(resolve=>{finish=resolve;});
  const pending=(app as any).openStreetView(shop);
  (app as any).closeStreetView();
  finish({});
  await pending;
  assert.equal(events.filter(e=>e.name==='street_view_opened').length,1);
  assert.equal(events.filter(e=>e.name==='street_view_failed').length,1);
});

test('boots into Tokyo with working city filtering and disabled pending map controls',()=>{
  assert.equal(rows().length,100);
  assert.ok(el('[data-load-more]'));
  assert.equal(el('[data-city="tokyo"]').getAttribute('aria-current'),'true');
  assert.ok((el('#zoom-in') as HTMLButtonElement).disabled);
  click('[data-city="fukuoka"]');
  assert.equal(rows().length,100);
  assert.equal(el('#map-city').textContent,'Fukuoka');
  assert.ok(rows().every(r=>r.textContent?.includes('Fukuoka')));
});
test('city links keep crawlable destinations and expose only the current filter',()=>{
  const assertCurrent = (city:string) => {
    const links = [...window.document.querySelectorAll<HTMLAnchorElement>('.city-btn')];
    assert.deepEqual(links.filter(link=>link.hasAttribute('aria-current')).map(link=>link.dataset.city),[city]);
    for (const link of links) {
      assert.equal(link.tagName,'A');
      assert.equal(link.hasAttribute('aria-pressed'),false);
      assert.equal(link.getAttribute('href'),link.dataset.city === 'all' ? '/catalog/' : `/city/${link.dataset.city}/`);
    }
    assert.equal(el(`[data-city="${city}"]`).getAttribute('aria-current'),'true');
  };
  assertCurrent('tokyo');
  click('[data-city="fukuoka"]');
  assertCurrent('fukuoka');
  click('[data-city="all"]');
  assertCurrent('all');
  click('#clear-filters');
  assertCurrent('all');
  click('[data-city="tokyo"]');
  assertCurrent('tokyo');

  for (const modifier of ['ctrlKey','metaKey','shiftKey','altKey']) {
    const event = new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0,[modifier]:true});
    el('[data-city="fukuoka"]').dispatchEvent(event);
    assert.equal(event.defaultPrevented,false);
    assertCurrent('tokyo');
  }
});
test('bookmarks need an account: guests are invited to sign up; saves survive tab changes and can be removed',async()=>{
  const account=fakeAccount({signedIn:false});
  click('[data-save="afuri-ebisu"]');await settle();
  assert.equal((el('dialog.save-prompt') as unknown as HTMLDialogElement).open,true,'the sign-up prompt opens');
  assert.equal(el('#saved-count').textContent,'0');
  assert.equal(window.localStorage.getItem('soupmap:saved:v1'),null,'nothing saved to the device');
  click('dialog.save-prompt .save-prompt__dismiss');
  account.signedIn=true;
  click('[data-save="afuri-ebisu"]');await settle();
  assert.equal(el('#saved-count').textContent,'1');
  assert.deepEqual(account.saved,['afuri-ebisu']);
  click('#saved-tab');
  assert.equal(rows().length,1);
  click('[data-save="afuri-ebisu"]');await settle();
  assert.equal(rows().length,0);
  assert.deepEqual(account.saved,[]);
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
  // Only shops whose broth is miso remain (some suggested by their own names); AFURI is shio.
  assert.ok(rows().length>0);
  assert.ok(rows().every(r=>ORDERED_SHOPS.find(s=>s.slug===r.dataset.slug)?.broth==='miso'));
  assert.ok(el('#card').hidden);
  click('#clear-filters');
  assert.equal(rows().length,100);
  assert.ok(el('[data-load-more]'));
  assert.equal(el('#filter-count').textContent,'All styles');
});
test('card bookmark stays in sync with the collection and with account changes made elsewhere',async()=>{
  fakeAccount();
  click('[data-slug="ginza-kagari"]');
  click('[data-action="save"]');await settle();
  assert.equal(el('[data-action="save"]').getAttribute('aria-pressed'),'true');
  assert.equal(el('#saved-count').textContent,'1');
  // Another tab or the account page removed it: the account announces the change.
  setAccountSaved('current-session',[]);
  assert.equal(el('#saved-count').textContent,'0');
  assert.equal(el('[data-action="save"]').getAttribute('aria-pressed'),'false');
});
test('deep-link selection from another city reveals its entry and malformed hash is safe',()=>{
  app.select('ichiran-nakasu',{fly:false,focus:false});
  assert.equal(el('[data-city="fukuoka"]').getAttribute('aria-current'),'true');
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
  const shio = discover(ORDERED_SHOPS, {query:'',city:'tokyo',broths:new Set(['shio']),saved:new Set(),savedOnly:false,sort:'name'});
  assert.ok(shio.some(s=>displayName(s)===el('#card-title').textContent));
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

test('sharing is opt-in and includes only the selected saved shops', async () => {
  fakeAccount();
  const events=analyticsEvents();
  click('[data-save="afuri-ebisu"]');await settle();
  click('[data-save="ginza-kagari"]');await settle();
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
  Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});
  click('[data-shortlist-copy]');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events.filter(e=>e.name.startsWith('shortlist_link_')),[
    {name:'shortlist_link_created',data:{shop_count:1}},
    {name:'shortlist_link_copied',data:{shop_count:1}},
  ]);
  chooseShared('ginza-kagari');
  assert.equal((el('[data-shortlist-url]') as HTMLInputElement).value, '');
  click('[data-shortlist-close]');
  assert.equal(el('#shortlist-share').hidden, true);
  assert.equal(window.document.activeElement?.id, 'share-shortlist');
});

test('share chooser retains its named group when saved shops are removed', async () => {
  fakeAccount();
  click('[data-save="afuri-ebisu"]');await settle();
  click('#saved-tab');
  click('#share-shortlist');
  assertSavedShopGroup(1);
  setAccountSaved('current-session', []);
  assertSavedShopGroup(0);
  assert.match(el('.shortlist-share__list').textContent!, /No saved shops yet/);
});

test('shared view spans cities and adds individual saves without replacing existing ones', async () => {
  const account=fakeAccount();
  click('[data-save="ginza-kagari"]');await settle();
  openShared(['afuri-ebisu', 'ichiran-nakasu']);
  assert.deepEqual(rows().map(r => r.dataset.slug), ['afuri-ebisu', 'ichiran-nakasu']);
  assert.equal(el('#shared-tab').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(account.saved, ['ginza-kagari']);
  click('[data-save="afuri-ebisu"]');await settle();
  assert.deepEqual(account.saved, ['ginza-kagari', 'afuri-ebisu']);
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
  click('[data-save="afuri-ebisu"]');await settle();
  assert.deepEqual(account.saved, ['ginza-kagari']);
  assert.equal(window.localStorage.getItem('soupmap:saved:v1'), null);
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
  fakeAccount();
  const events=analyticsEvents();
  click('[data-save="afuri-ebisu"]');await settle();
  click('#saved-tab');
  click('#share-shortlist');
  chooseShared('afuri-ebisu');
  click('[data-shortlist-generate]');
  Object.defineProperty(globalThis, 'navigator', {value:{clipboard:{writeText:async()=>{throw new Error('denied');}}}, configurable:true});
  click('[data-shortlist-copy]');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(el('[data-shortlist-status]').textContent!, /copy it manually/);
  assert.equal(events.filter(e=>e.name==='shortlist_link_created').length,1);
  assert.equal(events.filter(e=>e.name==='shortlist_link_copied').length,0);
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

test('the map logo is a real home link and does not silently reset discovery',()=>{
  openShared(['afuri-ebisu']);
  const logo=el('.site-brand') as HTMLAnchorElement;
  assert.equal(logo.getAttribute('href'),'/');
  const event=new window.MouseEvent('click',{bubbles:true,cancelable:true,button:0});
  logo.dispatchEvent(event);
  assert.equal(event.defaultPrevented,false);
  assert.equal(el('#shared-shortlist').hidden,false);
});

test('chapters open on the current map and leave existing discovery filters usable',()=>{
  const hideChains=el('#hide-chains') as HTMLInputElement;
  hideChains.checked=true;
  hideChains.dispatchEvent(new window.Event('change'));
  click('#hubs-tab');
  assert.equal((el('#journey-dialog') as HTMLDialogElement).open,true);
  click('[data-hub="tokyo-first-bowls"]');
  assert.equal((el('#journey-dialog') as HTMLDialogElement).open,false);
  assert.deepEqual(new Set(rows().map(row=>row.dataset.slug)),new Set(['afuri-ebisu','ginza-kagari','rokurinsha-tokyo-station']));
  assert.equal(window.location.pathname,'/map/');
  assert.equal(new URLSearchParams(window.location.search).get('hub'),'tokyo-first-bowls');
  assert.equal(el('#collection-banner').hidden,false);
  assert.equal(hideChains.checked,false);
  hideChains.checked=true;
  hideChains.dispatchEvent(new window.Event('change'));
  click('#saved-tab');
  assert.equal(el('#collection-banner').hidden,true);
  assert.equal(hideChains.checked,false);
  assert.equal(window.location.search,'');
  click('#explore-tab');
  assert.ok(rows().length>3);
});

test('reset filters clears both a chapter and the chain filter',()=>{
  click('#hubs-tab');click('[data-hub="tokyo-first-bowls"]');
  const hideChains=el('#hide-chains') as HTMLInputElement;
  hideChains.checked=true;
  hideChains.dispatchEvent(new window.Event('change'));
  assert.equal(el('#clear-filters').hidden,false);
  click('#clear-filters');
  assert.equal(el('#collection-banner').hidden,true);
  assert.equal(window.location.search,'');
  assert.equal(hideChains.checked,false);
  assert.equal(el('#clear-filters').hidden,true);
  assert.ok(rows().length>3);
});

test('visit stamps go to the account passport and coexist with shop facts, Street View and history',async()=>{
  const account=fakeAccount();
  app.select('afuri-ebisu',{fly:false,focus:false});
  assert.ok(el('#card [data-action="directions"]'));
  assert.ok(el('#card [data-action="stand-outside"]'));
  assert.ok(el('#card .card__history'));
  click('#card [data-action="visit"]');
  (el('#visit-form [name="bowl"]') as HTMLInputElement).value='Yuzu shio';
  (el('#visit-form [name="note"]') as HTMLTextAreaElement).value='My private memory';
  el('#visit-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal((account.entries.visit?.['afuri-ebisu'] as {note?:string}|undefined)?.note,'My private memory');
  assert.equal(window.localStorage.getItem('soupmap:passport:v1'),null,'never kept on the device');
  assert.equal(window.document.querySelectorAll('.visit-stamp').length,1);
  assert.ok(el('#card [data-action="visit"]').textContent?.includes('In your passport'));
  assert.equal(window.localStorage.getItem('soupmap:saved:v1'),null);
  click('#journey-close');
  assert.equal((el('#journey-dialog') as HTMLDialogElement).open,false);
});

test('field notes can target an imported shop without rendering the entire nationwide catalog',async()=>{
  // The community guide is switched off; drafts are saved privately to the account.
  const account=fakeAccount({other:()=>Response.json({enabled:false})});
  const shop=OPEN_SHOPS[0]!;
  app.select(shop.slug,{fly:false,focus:false});
  click('#card [data-action="contribute"]');
  const select=el('#note-shop') as HTMLSelectElement;
  assert.equal(select.value,shop.slug);
  // Soupmap selections plus this shop, never the nationwide catalog.
  assert.ok(select.options.length<100);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal((el('#note-submit') as HTMLButtonElement).disabled,true);
  assert.match(el('#community-status').textContent??'',/not connected/);
  (el('#field-note-form [name="body"]') as HTMLTextAreaElement).value='A useful note kept as a private draft.';
  click('[data-save-draft]');await settle();
  assert.equal((account.entries.draft?.community as {shop?:string}|undefined)?.shop,shop.slug);
  assert.equal(window.localStorage.getItem('soupmap:field-draft:v1'),null);
  assert.equal(window.localStorage.getItem('soupmap:receipts:v1'),null);
});

test('saving a chapter while signed in uses account saves and leaves guest storage alone',async context=>{
  const {setAccountSaved,accountSaved}=await import('../src/personal-saves.ts');
  const requests:string[]=[];
  context.mock.method(globalThis,'fetch',async (url:unknown)=>{requests.push(String(url));return Response.json({});});
  try {
    window.localStorage.setItem('soupmap:saved:v1',JSON.stringify(['sumire-susukino']));
    setAccountSaved('test-account',[]);
    click('#hubs-tab');click('[data-hub="tokyo-first-bowls"]');
    click('[data-collection-action="save"]');
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(requests.filter(url=>url.startsWith('/api/saved/')).length,3);
    assert.equal(accountSaved()?.size,3);
    assert.deepEqual(JSON.parse(window.localStorage.getItem('soupmap:saved:v1')!),['sumire-susukino']);
  } finally {setAccountSaved(null);}
});

test('dashboard link: /map/?open=passport opens the passport and tidies the address', () => {
  const dialog = window.document.querySelector('#journey-dialog') as unknown as HTMLDialogElement;
  assert.equal(dialog.open, true);
  assert.equal(window.location.search, '');
  assert.equal(window.document.querySelector('#journey-title')!.textContent, 'Your Soup Passport.');
});
