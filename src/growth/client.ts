import { esc } from '../ui/dom.ts';
import { maybeSignedIn } from '../session-hint.ts';
interface Passport {visits:string[];cities:Record<string,number>}
let passport:Passport|null=null;
let passportLoading:Promise<Passport>|null=null;
async function request<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(`/api/${path}`,{method,credentials:'same-origin',signal:AbortSignal.timeout(15000),
    ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  if(response.status===204)return null as T;
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error??'Please try again.'),{status:response.status});
  return data as T;
}
function refreshPassports() {
  for(const widget of document.querySelectorAll<HTMLElement>('[data-passport-city]')){
    const city=widget.dataset.passportCity!;const count=passport?.cities[city]??0;
    widget.querySelector('[data-passport-count]')!.textContent=`${Math.min(count,5)}/5 bowls tried in ${city}${count>=5?' · Chapter complete!':''}`;
    const progress=widget.querySelector('progress');if(progress)progress.value=Math.min(count,5);
    const button=widget.querySelector<HTMLButtonElement>('[data-passport-start]');
    if(button&&widget.dataset.passportShop)button.textContent=passport?.visits.includes(widget.dataset.passportShop)?'✓ Tried · Undo check-in':'Check in / Mark as tried →';
  }
}
async function loadPassport():Promise<Passport> {
  if(passport)return passport;
  passportLoading??=request<Passport>('passport').then(data=>{passport=data;refreshPassports();return data;}).finally(()=>passportLoading=null);
  return passportLoading;
}
function signIn() {
  const back=location.pathname+location.search+location.hash;
  location.assign(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
}
async function checkIn(widget:HTMLElement,button:HTMLButtonElement) {
  const status=widget.querySelector<HTMLElement>('[data-passport-status]')!;
  button.disabled=true;
  try{
    const data=await loadPassport();const slug=widget.dataset.passportShop;
    if(!slug){if(location.pathname==='/map/'){status.textContent='Choose a restaurant on the map, then mark it as tried here.';}else{try{sessionStorage.setItem('soupmap:map-intent',String(Date.now()));}catch{}location.assign('/map/?passport=1');}return;}
    const tried=!data.visits.includes(slug);
    await request(`passport/${encodeURIComponent(slug)}`,'PUT',{tried});
    passport=null;await loadPassport();
    status.textContent=tried?'Stamp saved to your account.':'Check-in removed.';
  }catch(error){
    if((error as {status?:number}).status===401){signIn();return;}
    status.textContent=error instanceof Error?error.message:'Your stamp could not be saved.';
  }finally{button.disabled=false;}
}
const observedWeather=new WeakSet<Element>();
async function loadWeather(widget:HTMLElement) {
  const copy=widget.querySelector('[data-weather-copy]')!;
  const detail=widget.querySelector('[data-weather-detail]')!;
  const retry=widget.querySelector<HTMLButtonElement>('[data-weather-retry]')!;
  retry.hidden=true;
  try{
    const weather=await request<{temperatureC:number;precipitation:number;code:number;time:string;score:number}|null>(`growth/weather?lat=${widget.dataset.weatherLat}&lng=${widget.dataset.weatherLng}`);
    // This site has no weather service configured: leave no empty box behind.
    if(!weather){widget.remove();return;}
    const temp=Math.round(weather.temperatureC*9/5+32);
    const conditions=weather.code>=71&&weather.code<=77?'Snowy':weather.precipitation>0?'Rainy':weather.code<=1?'Clear':'Cloudy';
    copy.textContent=`${temp}°F / ${Math.round(weather.temperatureC)}°C & ${conditions} in ${widget.dataset.weatherCity}`;
    detail.textContent=`${weather.score>=8?'Prime soup weather':'There’s always a bowl for today'} · ${weather.score.toFixed(1)}/10 · Updated ${new Date(weather.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  }catch{copy.textContent=`Soup forecast in ${widget.dataset.weatherCity}`;detail.textContent='Current weather is unavailable. The soup guide is still ready to explore.';retry.hidden=false;}
}
const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){observer?.unobserve(entry.target);void loadWeather(entry.target as HTMLElement);}
},{rootMargin:'100px'});
export function mountGrowth(root:ParentNode=document) {
  for(const widget of root.querySelectorAll<HTMLElement>('[data-weather-lat]')){
    if(observedWeather.has(widget))continue;observedWeather.add(widget);
    if(observer)observer.observe(widget);else void loadWeather(widget);
  }
  refreshPassports();
}
let mounted=false;
export function startGrowth() {
  if(mounted)return;mounted=true;mountGrowth();
  document.addEventListener('click',event=>{
    const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if(link && new URL(link.href).origin===location.origin && new URL(link.href).pathname==='/map/') {try{sessionStorage.setItem('soupmap:map-intent',String(Date.now()));}catch{}}
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-passport-start],[data-weather-retry],[data-badge-copy]');
    if(!button)return;
    if(button.hasAttribute('data-passport-start'))void checkIn(button.closest<HTMLElement>('[data-passport-city]')!,button);
    if(button.hasAttribute('data-weather-retry'))void loadWeather(button.closest<HTMLElement>('[data-weather-lat]')!);
    if(button.hasAttribute('data-badge-copy')){
      const input=document.querySelector<HTMLTextAreaElement>('[data-badge-code]');
      if(input)void navigator.clipboard?.writeText(input.value).then(()=>button.textContent='Copied ✓').catch(()=>{input.focus();input.select();button.textContent='Select and copy the code';});
    }
  });
  document.addEventListener('submit',event=>{
    const form=event.target as HTMLFormElement;if(!form.matches('[data-growth-form]'))return;event.preventDefault();
    void submit(form);
  });
  window.addEventListener('soupmap:profile-open',()=>mountGrowth());
  // Authentication and its database-backed passport only load after a human interaction, and
  // only for a browser that may be signed in: guests would just get "sign in" back.
  const hydrate=()=>{void loadPassport().catch(()=>{});};
  if(document.querySelector('[data-passport-city]')&&maybeSignedIn()){document.addEventListener('pointerdown',hydrate,{once:true});document.addEventListener('keydown',hydrate,{once:true});}
  if(location.pathname.startsWith('/claim'))void setupClaim();
}
async function submit(form:HTMLFormElement) {
  const data=new FormData(form);const kind=form.dataset.growthForm;
  const body:Record<string,unknown>=Object.fromEntries(data);
  for(const field of kind==='claim'?['badge','featured','consent']:['marketing'])body[field]=data.has(field);
  const status=form.querySelector<HTMLElement>('[data-form-status]')!;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  button.disabled=true;status.textContent='Saving…';
  try{const result=await request<{message:string}>(`growth/${kind==='claim'?'claims':'leads'}`,'POST',body);status.textContent=result.message;}
  catch(error){status.textContent=error instanceof Error?error.message:'Could not save. Please retry.';}
  finally{button.disabled=false;}
}
async function setupClaim() {
  const input=document.querySelector<HTMLInputElement>('[data-claim-shop]');if(!input)return;
  const slug=new URL(location.href).searchParams.get('shop');if(slug)input.value=slug;
  async function update(){
    const name=document.querySelector('[data-claim-name]')!;const badge=document.querySelector('[data-claim-badge]')!;
    name.textContent='';badge.replaceChildren();const current=input!.value;
    if(!current)return;
    try{const result=await request<{name:string;badge:{label:string;image:string;embed:string;evidence:string|null}}>(`growth/place/${encodeURIComponent(current)}`);
      if(input!.value!==current)return;name.textContent=result.name;
      badge.innerHTML=`<img src="${esc(result.badge.image)}" width="320" height="104" alt="${esc(result.badge.label)}" style="max-width:100%;height:auto"><label>Your website embed<textarea data-badge-code readonly>${esc(result.badge.embed)}</textarea></label><button type="button" class="directory-button" data-badge-copy>Copy embed code</button>${result.badge.evidence?`<a href="${esc(result.badge.evidence)}">See ranking evidence</a>`:''}`;
    }catch{name.textContent='Choose a valid Soupmap listing ID.';}
  }
  input.addEventListener('change',()=>void update());await update();
}
if(typeof document!=='undefined')startGrowth();
