import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { leadCapture, passportWidget, weatherWidget } from '../src/growth/render.ts';
import { CURATED_SHOPS } from '../src/data/shops.ts';

test('catalog widgets defer account reads, submit explicit consent, save stamps, and recover from failures',async()=>{
  const shop=CURATED_SHOPS[0]!;
  const window=new Window({url:`https://soupmap.com/catalog/${shop.slug}/`});
  window.document.write(leadCapture(shop)+passportWidget(shop.city,shop.slug)+weatherWidget(shop));
  const keys=['window','document','location','navigator','HTMLElement','Element','HTMLFormElement','HTMLButtonElement','HTMLInputElement','FormData','sessionStorage'];
  const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?window:(window as any)[key]});
  const originalFetch=globalThis.fetch;const calls:{path:string;method:string;body:any}[]=[];let tried=false;let fail=false;let weatherFail=true;
  globalThis.fetch=(async(input:any,options:any={})=>{
    const path=String(input);const method=options.method??'GET';const body=options.body?JSON.parse(options.body):null;
    calls.push({path,method,body});
    if(path.includes('/weather'))return weatherFail?Response.json({error:'offline'},{status:503}):Response.json({temperatureC:10,precipitation:1,code:61,time:new Date().toISOString(),score:9.4});
    if(path==='/api/passport')return Response.json({visits:tried?[shop.slug]:[],cities:{[shop.city]:tried?1:0}});
    if(path.startsWith('/api/passport/')){tried=body.tried;return Response.json({ok:true});}
    if(path==='/api/growth/leads')return fail?Response.json({error:'Could not save. Retry.'},{status:503}):Response.json({message:'Your request is saved. Email delivery is pending.'},{status:202});
    throw Error('Unexpected request '+path);
  }) as typeof fetch;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
  try{
    await import('../src/growth/client.ts');await tick();
    assert.equal(calls.filter(c=>c.path==='/api/passport').length,0,'No account query on crawler/page load');
    const retry=window.document.querySelector<HTMLButtonElement>('[data-weather-retry]')!;
    assert.equal(retry.hidden,false);weatherFail=false;retry.click();await tick();
    assert.match(window.document.querySelector('[data-weather-detail]')!.textContent,/9.4\/10/);
    const form=window.document.querySelector<HTMLFormElement>('[data-growth-form]')!;
    (form.elements.namedItem('email') as HTMLInputElement).value='reader@example.com';
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
    const lead=calls.find(c=>c.path==='/api/growth/leads')!;assert.equal(lead.body.marketing,false);assert.equal(lead.body.shop,shop.slug);
    assert.match(form.querySelector('[data-form-status]')!.textContent,/pending/);
    fail=true;form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.match(form.querySelector('[data-form-status]')!.textContent,/Retry/);assert.equal(form.querySelector<HTMLButtonElement>('button')!.disabled,false);
    const stamp=window.document.querySelector<HTMLButtonElement>('[data-passport-start]')!;
    stamp.click();await tick();assert.equal(tried,true);assert.match(window.document.querySelector('[data-passport-count]')!.textContent,/1\/5/);
    stamp.click();await tick();assert.equal(tried,false);assert.match(window.document.querySelector('[data-passport-count]')!.textContent,/0\/5/);
  }finally{
    globalThis.fetch=originalFetch;
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
    await window.happyDOM.close();
  }
});
