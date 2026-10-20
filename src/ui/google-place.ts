/// <reference types="google.maps" />
import type { Shop } from '../data/schema.ts';
import { loadPlaceLibrary } from '../map/google-loader.ts';

/**
 * Only the Places UI Kit renders Google content. Its service terms permit use
 * alongside non-Google maps; raw Places API content does not have that exception.
 * No scraping, bulk enrichment, photo downloads, or persistent Google-content cache.
 */
export function mountGooglePlace(host: HTMLElement, shop: Shop,
  options: {key?:string; load?: (key:string)=>Promise<unknown>; timeoutMs?:number} = {}): () => void {
  const key=options.key ?? (import.meta.env?.VITE_GOOGLE_MAPS_KEY ?? '').trim();
  const load=options.load ?? loadPlaceLibrary;
  const button=host.querySelector<HTMLButtonElement>('[data-google-load]')!;
  const status=host.querySelector<HTMLElement>('[data-google-status]')!;
  const content=host.querySelector<HTMLElement>('[data-google-content]')!;
  let disposed=false;
  let activated=false;
  let revision=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let search:google.maps.places.PlaceSearchElement|undefined;
  const stopTimer=()=>{clearTimeout(timer);timer=undefined;};
  const fail=()=>{
    if(disposed||!activated)return;
    ++revision;stopTimer();content.replaceChildren();search=undefined;
    status.textContent='Google details are unavailable right now. Try again, or use the Google Maps link below.';
    button.disabled=false;button.hidden=false;button.textContent='Try Google again ↗';host.removeAttribute('aria-busy');
  };
  const watch=(element:HTMLElement,onLoad:()=>void)=>{
    stopTimer();const attempt=revision;
    element.addEventListener('gmp-load',()=>{if(disposed||attempt!==revision)return;stopTimer();host.removeAttribute('aria-busy');onLoad();},{once:true});
    element.addEventListener('gmp-error',()=>{if(attempt===revision)fail();},{once:true});
    timer=setTimeout(fail,options.timeoutMs ?? 20000);
  };
  function selectPlace(place:google.maps.places.Place) {
    if(disposed||!place.id)return;
    ++revision;host.setAttribute('aria-busy','true');
    status.textContent='Loading this restaurant’s details…';
    const details=document.createElement('gmp-place-details') as google.maps.places.PlaceDetailsElement;
    details.innerHTML='<gmp-place-content-config><gmp-place-media lightbox-preferred></gmp-place-media><gmp-place-address></gmp-place-address><gmp-place-rating></gmp-place-rating><gmp-place-price></gmp-place-price><gmp-place-open-now-status></gmp-place-open-now-status><gmp-place-opening-hours></gmp-place-opening-hours><gmp-place-website></gmp-place-website><gmp-place-phone-number></gmp-place-phone-number><gmp-place-reviews></gmp-place-reviews><gmp-place-attribution light-scheme-color="black" dark-scheme-color="white"></gmp-place-attribution></gmp-place-content-config>';
    const request=document.createElement('gmp-place-details-place-request') as google.maps.places.PlaceDetailsPlaceRequestElement;
    request.place=place.id;details.append(request);
    const back=document.createElement('button');back.type='button';back.className='google-place-back';back.textContent='← Choose a different match';
    back.addEventListener('click',()=>{++revision;stopTimer();host.removeAttribute('aria-busy');content.replaceChildren(search!);status.textContent='Choose the matching name and address. Google results may include other branches.';});
    watch(details,()=>{status.textContent='Restaurant details from Google Maps. Soupmap notes are shown separately.';});
    content.replaceChildren(back,details);
  }
  async function start() {
    if(disposed||button.disabled)return;
    if(!key){status.textContent='In-app Google details are not connected yet. Use the Google Maps link to check this restaurant.';return;}
    activated=true;button.disabled=true;host.setAttribute('aria-busy','true');status.textContent='Finding this restaurant on Google Maps…';
    const attempt=++revision;
    try{
      await load(key);if(disposed||attempt!==revision)return;
      search=document.createElement('gmp-place-search') as google.maps.places.PlaceSearchElement;
      search.selectable=true;
      search.innerHTML='<gmp-place-content-config><gmp-place-address></gmp-place-address><gmp-place-rating></gmp-place-rating><gmp-place-media></gmp-place-media><gmp-place-attribution light-scheme-color="black" dark-scheme-color="white"></gmp-place-attribution></gmp-place-content-config>';
      const request=document.createElement('gmp-place-text-search-request') as google.maps.places.PlaceTextSearchRequestElement;
      request.maxResultCount=3;request.locationBias={lat:shop.lat,lng:shop.lng};
      request.textQuery=`${shop.nameJa || shop.name} ${shop.city} Japan`;
      search.append(request);
      search.addEventListener('gmp-select',event=>{if(!disposed&&event.place)selectPlace(event.place);});
      watch(search,()=>{
        const empty=search?.places?.length===0;
        status.textContent=empty?'No matching restaurant was returned. Try Google Maps directly.':'Choose the matching name and address. Google results may include other branches.';
        button.disabled=false;button.hidden=!empty;
      });
      content.replaceChildren(search);
    }catch{if(attempt===revision)fail();}
  }
  button.addEventListener('click',start);
  window.addEventListener('soupmap:google-auth-error',fail);
  return ()=>{disposed=true;++revision;stopTimer();button.removeEventListener('click',start);window.removeEventListener('soupmap:google-auth-error',fail);content.replaceChildren();search=undefined;};
}
