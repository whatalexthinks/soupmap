import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {CURATED_SHOPS} from '../src/data/shops.ts';
import {googlePanelShell} from '../src/render/directory.ts';
import {mountGooglePlace} from '../src/ui/google-place.ts';
let window:Window;
let dispose:(()=>void)|undefined;
beforeEach(()=>{
  window=new Window();
  Object.defineProperty(globalThis,'window',{value:window,configurable:true});
  Object.defineProperty(globalThis,'document',{value:window.document,configurable:true});
  window.document.write(googlePanelShell());
});
afterEach(async()=>{dispose?.();dispose=undefined;await window.happyDOM.close();});
const host=()=>window.document.querySelector<HTMLElement>('.google-place-panel')! as unknown as HTMLElement;
const button=()=>window.document.querySelector<HTMLButtonElement>('[data-google-load]')!;
const status=()=>window.document.querySelector('[data-google-status]')!.textContent;
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

test('Google data loads only after explicit intent and branch confirmation, with native attribution',async()=>{
  let loads=0;dispose=mountGooglePlace(host(),CURATED_SHOPS[0]!,{key:'test',load:async()=>{loads++;}});
  assert.equal(loads,0);button().click();await flush();assert.equal(loads,1);
  const search=window.document.querySelector('gmp-place-search')!;
  const request=search.querySelector('gmp-place-text-search-request')! as any;
  assert.equal(request.maxResultCount,3);assert.match(request.textQuery,/AFURI|阿夫利/i);
  search.dispatchEvent(new window.Event('gmp-load'));
  assert.match(status(),/Choose the matching/);
  assert.equal(window.document.querySelector('gmp-place-details'),null);
  const select=new window.Event('gmp-select');Object.assign(select,{place:{id:'confirmed-branch'}});search.dispatchEvent(select);
  const details=window.document.querySelector('gmp-place-details')!;
  assert.equal((details.querySelector('gmp-place-details-place-request') as any).place,'confirmed-branch');
  for(const tag of ['gmp-place-media','gmp-place-rating','gmp-place-opening-hours','gmp-place-reviews','gmp-place-attribution'])assert.ok(details.querySelector(tag));
  details.dispatchEvent(new window.Event('gmp-load'));
  assert.match(status(),/Soupmap notes are shown separately/);
  assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
});

test('missing configuration and Google errors preserve fallback and allow retry',async()=>{
  let calls=0;dispose=mountGooglePlace(host(),CURATED_SHOPS[0]!,{key:'',load:async()=>{calls++;}});
  button().click();assert.equal(calls,0);assert.match(status(),/not connected/);
  dispose();dispose=mountGooglePlace(host(),CURATED_SHOPS[0]!,{key:'test',load:async()=>{throw Error('denied');}});
  button().click();await flush();assert.match(status(),/unavailable/);assert.equal(button().disabled,false);
});

test('closing or switching profiles discards late Google loads',async()=>{
  let finish!:()=>void;
  dispose=mountGooglePlace(host(),CURATED_SHOPS[0]!,{key:'test',load:()=>new Promise<void>(resolve=>{finish=resolve;})});
  button().click();dispose();finish();await flush();
  assert.equal(window.document.querySelector('gmp-place-search'),null);
});

test('an unresponsive Google widget times out and can be retried',async()=>{
  dispose=mountGooglePlace(host(),CURATED_SHOPS[0]!,{key:'test',load:async()=>{},timeoutMs:5});
  button().click();await new Promise(resolve=>setTimeout(resolve,20));
  assert.match(status(),/unavailable/);assert.equal(button().disabled,false);assert.equal(host().hasAttribute('aria-busy'),false);
});
