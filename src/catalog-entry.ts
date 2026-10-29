import { startGrowth } from './growth/client.ts';
import { SAVED_KEY } from './saved-key.ts';
import { maybeSignedIn } from './session-hint.ts';
startGrowth();
let ready=false;
let loading:Promise<void>|null=null;
function activate():Promise<void> {
  loading??=import('./catalog/controller.ts').then(({mountDirectory})=>{mountDirectory();ready=true;document.querySelector('[data-activate-directory]')?.remove();}).catch(()=>{
    loading=null;const status=document.querySelector('[data-directory-status]');
    if(status)status.textContent='Interactive search could not load. Browse the pages below or try again.';
  });
  return loading;
}
const form=document.querySelector('#directory-controls');
if(form){
  const button=document.createElement('button');button.type='button';button.className='directory-button';
  button.dataset.activateDirectory='';button.textContent='Search & filter this guide →';
  button.addEventListener('click',()=>{void activate();});form.before(button);
}
document.addEventListener('click',event=>{
  const target=(event.target as Element).closest<HTMLElement>('[data-google-load]');
  if(!target||ready)return;
  event.preventDefault();event.stopImmediatePropagation();
  void activate().then(()=>{if(ready)target.click();});
},true);

// Save works before the directory loads: show this device's saves now. The first click loads the
// directory (and the account, when signed in), then applies what the visitor saw and chose.
const announce=(message:string)=>document.querySelectorAll('[data-directory-status],[data-profile-status]').forEach(el=>{el.textContent=message;});
let deviceSaves=new Set<string>();
try{const stored=JSON.parse(localStorage.getItem(SAVED_KEY)??'[]');if(Array.isArray(stored))deviceSaves=new Set(stored.filter((id):id is string=>typeof id==='string'));}catch{/* Storage off: nothing saved here yet. */}
document.querySelectorAll<HTMLButtonElement>('[data-directory-save]').forEach(button=>{
  const on=deviceSaves.has(button.dataset.directorySave!);
  button.hidden=false;button.setAttribute('aria-pressed',String(on));button.textContent=on?'Saved ✓':'Save +';
});
// Only runs after the directory loaded, which already brought the account-saves module.
async function accountReady(timeout=8000):Promise<boolean> {
  const {accountSaved}=await import('./personal-saves.ts');
  return new Promise(resolve=>{
    if(accountSaved()){resolve(true);return;}
    const done=(ok:boolean)=>{window.removeEventListener('soupmap:account-saves',check);clearTimeout(timer);resolve(ok);};
    const check=()=>{if(accountSaved())done(true);};
    const timer=setTimeout(()=>done(false),timeout);
    window.addEventListener('soupmap:account-saves',check);
  });
}
document.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-directory-save]');
  if(!button||ready)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.disabled)return;
  const slug=button.dataset.directorySave!;
  const want=button.getAttribute('aria-pressed')!=='true';
  button.disabled=true;announce('Saving…');
  void activate().then(async()=>{
    if(!ready){button.disabled=false;announce('Saving needs the full guide, which could not load. Please try again.');return;}
    // A signed-in visitor's save belongs in their account, not on this device.
    if(maybeSignedIn()&&!await accountReady()){announce('Your account is still loading. Please try again in a moment.');return;}
    const current=document.querySelector<HTMLButtonElement>(`[data-directory-save="${CSS.escape(slug)}"]`);
    if(!current)return;
    if((current.getAttribute('aria-pressed')==='true')===want)announce(want?'Already in your saved places.':'Not in your saved places.');
    else current.click();
  });
},true);
// A query is an explicit navigation to interactive results; ordinary crawler visits stay static.
if(new URLSearchParams(location.search).has('place')||new URLSearchParams(location.search).has('q')||new URLSearchParams(location.search).has('collection'))void activate();
