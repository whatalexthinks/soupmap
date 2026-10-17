import test, {beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {App} from '../src/app.ts';
import {router} from '../src/router.ts';
let window: Window;
let app: App;
beforeEach(()=>{
  window=new Window({url:'https://soupmap.example/'});
  window.document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  for (const key of ['document','location','history','localStorage','CSS','HTMLElement','Element','HTMLButtonElement']) {
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
  assert.equal(rows().length,3);
  assert.equal(el('[data-city="tokyo"]').getAttribute('aria-pressed'),'true');
  assert.ok((el('#zoom-in') as HTMLButtonElement).disabled);
  click('[data-city="fukuoka"]');
  assert.equal(rows().length,3);
  assert.equal(el('#map-city').textContent,'Fukuoka');
  assert.ok(rows().every(r=>r.textContent?.includes('Tonkotsu')));
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
  assert.equal(rows().length,1);
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
  assert.equal(rows().length,15);
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
  assert.equal(rows()[0]?.dataset.slug,'afuri-ebisu');
  click('[data-broth="shio"]');
  click('#surprise-btn');
  assert.equal(el('#card-title').textContent,'AFURI Ebisu');
});
