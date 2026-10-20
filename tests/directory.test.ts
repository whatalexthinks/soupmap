import test, {beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {ORDERED_SHOPS, CURATED_SHOPS, OPEN_SHOPS} from '../src/data/shops.ts';
import {directoryState, directoryResults, directoryUrl, DIRECTORY_PAGE_SIZE} from '../src/catalog/state.ts';
import {catalogPages, catalogDocument} from '../src/render/catalog.ts';
import {profileUrl} from '../src/render/directory.ts';
import {mountDirectory} from '../src/catalog/controller.ts';
import {accountSaved, setAccountSaved} from '../src/personal-saves.ts';
import {SAVED_KEY} from '../src/discovery.ts';

const origin='https://soupmap.example';
const root=catalogPages(CURATED_SHOPS).find(page=>page.path==='/catalog/')!;
let window:Window;
beforeEach(()=>{
  window=new Window({url:origin+'/catalog/'});
  for(const key of ['window','document','Event','HTMLElement','Element','location','history','localStorage','navigator']){
    Object.defineProperty(globalThis,key,{value:key==='window'?window:(window as any)[key],configurable:true});
  }
  Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>0,configurable:true});
  window.document.write(catalogDocument(root,origin,'/style.css'));
  setAccountSaved(null);
});
afterEach(async()=>{setAccountSaved(null);await window.happyDOM.close();});
const el=<T extends HTMLElement=HTMLElement>(selector:string)=>window.document.querySelector(selector) as unknown as T;
const click=(selector:string)=>el(selector).click();
function change(id:string,value:string){el<HTMLSelectElement>(id).value=value;el(id).dispatchEvent(new window.Event('change',{bubbles:true}));}
const cards=()=>[...window.document.querySelectorAll<HTMLElement>('#directory-results [data-record]')];

test('directory filters search the entire catalog and URLs round-trip without location storage',()=>{
  const state=directoryState(new URL(origin+'/catalog/?q=afuri&city=tokyo&cuisine=ramen&collection=editorial&independent=1&sort=name&p=2'));
  assert.deepEqual(directoryState(directoryUrl(state,'all',new URL(origin))),state);
  state.page=1;state.hideChains=false;
  assert.ok(directoryResults(ORDERED_SHOPS,state,new Set()).some(s=>s.slug==='afuri-ebisu'));
  state.query='';state.collection='saved';
  assert.deepEqual(directoryResults(ORDERED_SHOPS,state,new Set(['afuri-ebisu'])).map(s=>s.slug),['afuri-ebisu']);
  assert.equal(directoryState(new URL(origin+'/?p=-2&city=bogus&cuisine=bogus')).page,1);
  assert.ok(!directoryUrl({...state,sort:'distance'},'all',new URL(origin)).search.includes('distance'));
});

test('directory works without a map, supports filtering, empty recovery and bounded paging',()=>{
  mountDirectory({account:false});
  assert.equal(el('#directory-controls').hidden,false);
  assert.equal(cards().length,DIRECTORY_PAGE_SIZE);
  assert.equal(window.document.querySelector('#cesium'),null);
  change('#directory-city','osaka');change('#directory-cuisine','udon');
  assert.match(el('[data-directory-heading]').textContent??'',/Osaka/);
  assert.equal(el('[data-directory-region]').textContent,'Osaka');
  assert.ok(cards().length>0);
  assert.ok(cards().every(card=>ORDERED_SHOPS.find(s=>s.slug===card.dataset.record)?.city==='Osaka'));
  change('#directory-collection','editorial');
  assert.deepEqual(cards().map(c=>c.dataset.record),['dotonbori-imai']);
  change('#directory-cuisine','soba');assert.equal(cards().length,0);
  click('[data-directory-reset]');assert.equal(cards().length,DIRECTORY_PAGE_SIZE);
  const first=cards()[0]!.dataset.record;
  click('[data-page-step="1"]');assert.notEqual(cards()[0]!.dataset.record,first);
  assert.equal(new URL(window.location.href).searchParams.get('p'),'2');
  click('[data-page-step="-1"]');assert.equal(cards()[0]!.dataset.record,first);
});

test('profile deep links open imported records without redirecting people to the map',()=>{
  const shop=OPEN_SHOPS[0]!;
  window.history.replaceState(null,'',profileUrl(shop));
  mountDirectory({account:false});
  assert.equal(el<HTMLDialogElement>('#place-dialog').open,true);
  assert.equal(el('[data-place-profile]').dataset.placeProfile,shop.slug);
  assert.ok(el('[data-google-load]'));
  click('#place-close');
  assert.equal(el<HTMLDialogElement>('#place-dialog').open,false);
  assert.equal(window.location.pathname,'/catalog/');
  assert.equal(window.location.search,'');
});

test('guest saves persist across catalog and map and profile close restores keyboard focus',()=>{
  mountDirectory({account:false});
  change('#directory-collection','editorial');
  const trigger=el('[data-profile="afuri-ebisu"]');trigger.focus();trigger.click();
  click('#place-dialog [data-directory-save]');
  assert.deepEqual(JSON.parse(window.localStorage.getItem(SAVED_KEY)!),['afuri-ebisu']);
  click('#place-close');assert.equal(window.document.activeElement,trigger);
  change('#directory-collection','saved');assert.equal(cards().length,1);
  click('#directory-results [data-directory-save]');assert.equal(cards().length,0);
});

test('signed-in directory saves use the account and never overwrite guest storage',async context=>{
  window.localStorage.setItem(SAVED_KEY,JSON.stringify(['afuri-ebisu']));
  mountDirectory({account:false});setAccountSaved('account',[]);
  const calls:string[]=[];
  context.mock.method(globalThis,'fetch',async(url:unknown)=>{calls.push(String(url));return Response.json({});});
  click('[data-directory-save="ginza-kagari"]');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(calls,['/api/saved/ginza-kagari']);
  assert.ok(accountSaved()?.has('ginza-kagari'));
  assert.deepEqual(JSON.parse(window.localStorage.getItem(SAVED_KEY)!),['afuri-ebisu']);
});

test('denied geolocation keeps the prior sort and does not persist coordinates',async()=>{
  Object.defineProperty(window.navigator,'geolocation',{value:{getCurrentPosition:(_ok:unknown,fail:Function)=>fail(new Error('denied'))}});
  mountDirectory({account:false});change('#directory-sort','name');
  change('#directory-sort','distance');await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(el<HTMLSelectElement>('#directory-sort').value,'name');
  assert.match(el('[data-directory-status]').textContent??'',/unavailable or not allowed/);
  assert.equal(window.localStorage.length,0);
});
