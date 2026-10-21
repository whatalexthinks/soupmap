import { esc } from '../ui/dom.ts';
import { CUISINES } from '../cuisines.ts';
import { CITIES } from '../data/cities.ts';
import { ORDERED_SHOPS, shopBySlug, DETAILS_INLINE, type Shop } from '../data/shops.ts';
import { loadPlaceDetails } from '../data/load-open-catalog.ts';
import { directoryCard, profileHtml, profileUrl } from '../render/directory.ts';
import { contactHtml } from '../ui/shop-details.ts';
import { directoryState, directoryUrl, directoryResults, DIRECTORY_PAGE_SIZE, type DirectoryState } from './state.ts';
import { accountSaved, changeAccountSaved } from '../personal-saves.ts';
import { parseSaved, SAVED_KEY, distanceMeters } from '../discovery.ts';
import { mountGooglePlace } from '../ui/google-place.ts';
import { loadJapaneseFont } from '../fonts.ts';

/** No map engine or camera state is involved in directory browsing. */
export function mountDirectory(options: {account?:boolean} = {}): void {
  loadJapaneseFont();
  const browser=document.querySelector<HTMLElement>('#directory-browser');
  const form=document.querySelector<HTMLFormElement>('#directory-controls');
  const status=document.querySelector<HTMLElement>('[data-directory-status]');
  const dialog=document.querySelector<HTMLDialogElement>('#place-dialog');
  const content=document.querySelector<HTMLElement>('#place-dialog-content');
  const baseCity=browser?.dataset.city ?? 'all';
  const initialPage=Number(browser?.dataset.page ?? 1);
  let state=directoryState(new URL(location.href),baseCity,initialPage);
  const valid=new Set(shopBySlug.keys());
  let guest: Set<string>;
  try{guest=parseSaved(localStorage.getItem(SAVED_KEY),valid);}catch{guest=new Set();}
  let origin:{lat:number;lng:number}|undefined;
  let disposeProfile:(()=>void)|undefined;
  let selected: string | null=null;
  let trigger:HTMLElement|null=null;
  let debounce:ReturnType<typeof setTimeout>|undefined;
  let locationRevision=0;
  let view: 'grid'|'list' = 'grid';
  try { if(localStorage.getItem('soupmap:directory-view')==='list') view='list'; } catch { /* Session only. */ }
  const disclosure=form?.querySelector<HTMLDetailsElement>('.directory-filter-disclosure');
  const compactFilters=window.matchMedia?.('(max-width:800px)');
  if(disclosure && compactFilters){
    disclosure.open=!compactFilters.matches;
    compactFilters.addEventListener('change',event=>{disclosure.open=!event.matches;});
  }
  document.querySelectorAll<HTMLElement>('.directory-views,.directory-collections').forEach(el=>{el.hidden=false;});
  function syncPresentation() {
    const results=document.getElementById('directory-results');if(results)results.dataset.view=view;
    document.querySelectorAll<HTMLElement>('[data-directory-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.directoryView===view)));
    document.querySelectorAll<HTMLElement>('[data-directory-collection]').forEach(link=>{
      if(link.dataset.directoryCollection===state.collection)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
    });
    const chips: Array<[string,string]> = [];
    if(state.query)chips.push(['query',`“${state.query}”`]);
    if(state.city!=='all')chips.push(['city',CITIES.find(c=>c.slug===state.city)?.name??state.city]);
    if(state.cuisine!=='all')chips.push(['cuisine',CUISINES.find(c=>c.id===state.cuisine)?.label??state.cuisine]);
    if(state.hideChains)chips.push(['chains','Independent places']);
    const active=document.getElementById('directory-active');
    if(active)active.innerHTML=chips.map(([key,label])=>`<button type="button" data-clear-filter="${key}" aria-label="Remove filter: ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`).join('');
  }
  const pendingSaves=new Set<string>();
  const saved=()=>accountSaved() ?? guest;
  const announce=(message:string)=>{if(status)status.textContent=message;document.querySelectorAll('[data-profile-status]').forEach(el=>{el.textContent=message;});};
  const input=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
  function syncInputs() {
    if(!form)return;
    input<HTMLInputElement>('directory-query').value=state.query;
    input<HTMLSelectElement>('directory-city').value=state.city;
    input<HTMLSelectElement>('directory-cuisine').value=state.cuisine;
    input<HTMLSelectElement>('directory-collection').value=state.collection;
    input<HTMLSelectElement>('directory-sort').value=state.sort;
    input<HTMLInputElement>('directory-independent').checked=state.hideChains;
  }
  function syncSaveButtons() {
    document.querySelectorAll<HTMLButtonElement>('[data-directory-save]').forEach(button=>{
      const slug=button.dataset.directorySave!;const on=saved().has(slug);
      button.hidden=false;button.disabled=pendingSaves.has(slug);button.setAttribute('aria-pressed',String(on));
      button.textContent=on ? 'Saved ✓' : 'Save +';
      button.setAttribute('aria-label',`${on?'Unsave':'Save'} ${shopBySlug.get(slug)?.name ?? 'place'}`);
    });
  }
  function render(updateUrl = true) {
    if(!browser)return;
    const city=CITIES.find(c=>c.slug===state.city);
    const heading=document.querySelector<HTMLElement>('[data-directory-heading]');
    if(heading)heading.textContent=city?`${city.name}. One bowl away.`:'The next bowl is out there.';
    const total=document.querySelector('[data-directory-total]');
    if(total)total.textContent=(city?ORDERED_SHOPS.filter(shop=>shop.city===city.name).length:ORDERED_SHOPS.length).toLocaleString();
    const region=document.querySelector('[data-directory-region]');if(region)region.textContent=city?.name??'Japan';
    document.querySelectorAll<HTMLAnchorElement>('.directory-cities a').forEach(link=>{
      if(link.getAttribute('href')===(city?`/city/${city.slug}/`:'/catalog/'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    const matches=directoryResults(ORDERED_SHOPS,state,saved(),origin);
    const pages=Math.max(1,Math.ceil(matches.length/DIRECTORY_PAGE_SIZE));
    state.page=Math.min(state.page,pages);
    const start=(state.page-1)*DIRECTORY_PAGE_SIZE;
    const results=input<HTMLOListElement>('directory-results');
    results.innerHTML=matches.length ? matches.slice(start,start+DIRECTORY_PAGE_SIZE).map(shop=>directoryCard(shop,saved().has(shop.slug),state.sort==='distance'&&origin?distanceMeters(origin,shop):undefined)).join('')
      : `<li class="directory-empty"><h2>${state.collection==='saved'?'Your next discoveries belong here.':'Nothing here just yet.'}</h2><p>${state.collection==='saved'?'Save places as you browse, or reset your filters to see more of your list.':'Try another city, a broader search, or fewer filters.'}</p><button class="directory-button" data-directory-reset>Reset filters</button></li>`;
    input('directory-count').textContent=matches.length?`${start+1}–${Math.min(start+DIRECTORY_PAGE_SIZE,matches.length)} of ${matches.length.toLocaleString()} places`:'No matching places';
    input('directory-pagination').innerHTML=`<button type="button" data-page-step="-1"${state.page===1?' disabled':''}>← Previous</button><span>Page ${state.page} of ${pages}</span><button type="button" data-page-step="1"${state.page===pages?' disabled':''}>Next →</button>`;
    document.querySelector('.directory-result-bar>span')!.textContent=state.sort==='distance'?'Straight-line distance · Location stays on this device':state.sort==='name'?'Name A–Z':'Soupmap selections first';
    if(updateUrl)history.replaceState(null,'',directoryUrl(state,baseCity,new URL(location.href)));
    syncSaveButtons();syncPresentation();
  }
  function reset() {
    clearTimeout(debounce);++locationRevision;
    state={query:'',city:'all',cuisine:'all',collection:'all',sort:'guide',hideChains:false,page:1};
    syncInputs();render();announce('Filters reset.');
  }
  async function changeSort() {
    const next=input<HTMLSelectElement>('directory-sort').value as DirectoryState['sort'];
    const revision=++locationRevision;
    if(next==='distance'&&!origin){
      if(!navigator.geolocation){syncInputs();announce('Location is unavailable. Choose another sort.');return;}
      announce('Allow location access to sort by distance.');
      try{
        const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000,maximumAge:300000,enableHighAccuracy:false}));
        if(revision!==locationRevision)return;
        origin={lat:p.coords.latitude,lng:p.coords.longitude};
      }catch{if(revision===locationRevision){syncInputs();announce('Location was unavailable or not allowed. Your previous sort is unchanged.');}return;}
    }
    if(revision!==locationRevision)return;
    state.sort=next;state.page=1;render();announce('');
  }
  function fillProfile(host:HTMLElement,shop:Shop):()=>void {
    let alive=true;
    const panel=host.querySelector<HTMLElement>('.google-place-panel');
    const cleanup=panel?mountGooglePlace(panel,shop):()=>{};
    if(!DETAILS_INLINE&&shop.sourceId){
      void loadPlaceDetails(shop.sourceId).then(details=>{
        const contact=host.querySelector('[data-profile-contact]');
        if(alive&&contact&&details)contact.innerHTML=`<h2>Contact &amp; location</h2>${contactHtml(details)}`;
      }).catch(()=>{/* Inline record and Google lookup remain available. */});
    }
    return ()=>{alive=false;cleanup();};
  }
  function openProfile(slug:string,updateUrl=true) {
    if(!dialog||!content)return;
    const shop=shopBySlug.get(slug);
    if(!shop){announce('This place is no longer in the catalog. Try searching for its name.');return;}
    if(selected===slug&&dialog.open)return;
    disposeProfile?.();selected=slug;
    trigger=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    content.innerHTML=profileHtml(shop);disposeProfile=fillProfile(content,shop);
    const permalink=document.querySelector<HTMLAnchorElement>('#place-permalink')!;permalink.href=profileUrl(shop);
    if(updateUrl){const url=new URL(location.href);url.searchParams.set('place',slug);history.pushState(null,'',url);}
    syncSaveButtons();if(!dialog.open)dialog.showModal();content.querySelector<HTMLElement>('h1')?.focus();
  }
  function closeProfile(updateUrl=true) {
    disposeProfile?.();disposeProfile=undefined;selected=null;
    if(dialog?.open)dialog.close();if(content)content.innerHTML='';
    if(updateUrl){const url=new URL(location.href);url.searchParams.delete('place');history.replaceState(null,'',url);}
    const fallback=document.querySelector<HTMLElement>('#directory-query');
    (trigger?.isConnected?trigger:fallback)?.focus({preventScroll:true});
  }
  async function save(slug:string) {
    if(!valid.has(slug)||pendingSaves.has(slug))return;
    pendingSaves.add(slug);syncSaveButtons();
    try{
      if(accountSaved()){
        const changed=await changeAccountSaved(slug,!saved().has(slug));
        announce(changed?'Account list updated.':'Your account changed. Check your saved places.');
      }else{
        if(guest.has(slug))guest.delete(slug);else guest.add(slug);
        try{localStorage.setItem(SAVED_KEY,JSON.stringify([...guest]));announce('Saved places updated on this device.');}
        catch{announce('Updated for this session. Device storage is unavailable.');}
      }
    }catch{announce('Could not update your account list. Please try again.');}
    finally{pendingSaves.delete(slug);if(state.collection==='saved')render();syncSaveButtons();}
  }
  form?.addEventListener('submit',e=>e.preventDefault());
  form?.addEventListener('reset',e=>{e.preventDefault();reset();});
  form?.addEventListener('input',e=>{
    if((e.target as HTMLElement).id!=='directory-query')return;
    clearTimeout(debounce);debounce=setTimeout(()=>{state.query=input<HTMLInputElement>('directory-query').value;state.page=1;render();},160);
  });
  form?.addEventListener('change',e=>{
    const id=(e.target as HTMLElement).id;
    if(id==='directory-sort'){void changeSort();return;}
    clearTimeout(debounce);state.query=input<HTMLInputElement>('directory-query').value;
    state.city=input<HTMLSelectElement>('directory-city').value;
    state.cuisine=input<HTMLSelectElement>('directory-cuisine').value as DirectoryState['cuisine'];
    state.collection=input<HTMLSelectElement>('directory-collection').value as DirectoryState['collection'];
    state.hideChains=input<HTMLInputElement>('directory-independent').checked;
    state.page=1;render();
  });
  document.addEventListener('click',e=>{
    const target=(e.target as Element).closest<HTMLElement>('[data-profile],[data-directory-save],[data-page-step],[data-directory-reset],[data-directory-view],[data-directory-collection],[data-clear-filter]');
    if(!target)return;
    if(target.dataset.directoryView) {
      view=target.dataset.directoryView==='list'?'list':'grid';
      try{localStorage.setItem('soupmap:directory-view',view);}catch{/* Session only. */}
      syncPresentation();return;
    }
    if(target.dataset.directoryCollection) {
      if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
      e.preventDefault();clearTimeout(debounce);
      state.query=input<HTMLInputElement>('directory-query').value;
      state.collection=target.dataset.directoryCollection as DirectoryState['collection'];state.page=1;
      syncInputs();render();return;
    }
    if(target.dataset.clearFilter) {
      clearTimeout(debounce);
      const key=target.dataset.clearFilter;
      state.query=input<HTMLInputElement>('directory-query').value;
      if(key==='query')state.query='';else if(key==='city')state.city='all';else if(key==='cuisine')state.cuisine='all';else state.hideChains=false;
      state.page=1;syncInputs();render();input('directory-query').focus({preventScroll:true});return;
    }
    if(target.dataset.profile){
      if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
      e.preventDefault();openProfile(target.dataset.profile);
    }else if(target.dataset.directorySave){void save(target.dataset.directorySave);}
    else if(target.dataset.pageStep){clearTimeout(debounce);state.query=input<HTMLInputElement>('directory-query').value;state.page+=Number(target.dataset.pageStep);render();input('directory-controls').scrollIntoView({block:'start'});input('directory-query').focus({preventScroll:true});}
    else reset();
  });
  document.querySelector('#place-close')?.addEventListener('click',()=>closeProfile());
  dialog?.addEventListener('cancel',e=>{e.preventDefault();closeProfile();});
  dialog?.addEventListener('click',e=>{if(e.target===dialog)closeProfile();});
  window.addEventListener('popstate',()=>{
    ++locationRevision;clearTimeout(debounce);
    state=directoryState(new URL(location.href),baseCity);syncInputs();render(false);
    const slug=new URL(location.href).searchParams.get('place');if(slug)openProfile(slug,false);else closeProfile(false);
  });
  window.addEventListener('soupmap:account-saves',()=>{render(false);syncSaveButtons();});
  window.addEventListener('storage',e=>{if(e.key===SAVED_KEY){guest=parseSaved(e.newValue,valid);render(false);syncSaveButtons();}});
  if(form){form.hidden=false;syncInputs();render(false);}
  const staticProfile=document.querySelector<HTMLElement>('main [data-place-profile]');
  const staticShop=staticProfile?shopBySlug.get(staticProfile.dataset.placeProfile!):undefined;
  if(staticProfile&&staticShop)fillProfile(staticProfile,staticShop);
  syncSaveButtons();
  const slug=new URL(location.href).searchParams.get('place');if(slug)openProfile(slug,false);
  const mount=document.querySelector<HTMLElement>('#directory-account');
  if(mount&&options.account!==false)void import('../account.tsx').then(m=>m.mountAccount(mount)).catch(()=>{/* Existing account link stays usable. */});
}
