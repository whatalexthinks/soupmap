import { startGrowth } from './growth/client.ts';
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

// Save is the sign-up moment, so it shows before the directory loads. Saving needs an account:
// the first click loads the directory, asks the server who this is (guests get the sign-up
// prompt), and only then applies the save, against the account's real list.
const announce=(message:string)=>document.querySelectorAll('[data-directory-status],[data-profile-status]').forEach(el=>{el.textContent=message;});
document.querySelectorAll<HTMLButtonElement>('[data-directory-save]').forEach(button=>{button.hidden=false;button.textContent='Save +';});
document.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-directory-save]');
  if(!button||ready)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.disabled)return;
  const slug=button.dataset.directorySave!;
  button.disabled=true;announce('Saving…');
  void activate().then(async()=>{
    if(!ready){button.disabled=false;announce('Saving needs the full guide, which could not load. Please try again.');return;}
    const {requireSaveAccount,accountSaved}=await import('./personal-saves.ts');
    let signedIn:boolean;
    try{signedIn=await requireSaveAccount('place');}
    catch{button.disabled=false;announce('Could not reach your account. Please try again.');return;}
    const current=document.querySelector<HTMLButtonElement>(`[data-directory-save="${CSS.escape(slug)}"]`);
    if(current)current.disabled=false;
    if(!signedIn){announce('');return;}
    // The visitor saw "Save +" before their list was known: never remove a place they already kept.
    if(accountSaved()?.has(slug))announce('Already in your saved places.');
    else current?.click();
  });
},true);
// A query is an explicit navigation to interactive results; ordinary crawler visits stay static.
if(new URLSearchParams(location.search).has('place')||new URLSearchParams(location.search).has('q')||new URLSearchParams(location.search).has('collection'))void activate();
