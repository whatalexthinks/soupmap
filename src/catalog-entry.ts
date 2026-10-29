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
// A query is an explicit navigation to interactive results; ordinary crawler visits stay static.
if(new URLSearchParams(location.search).has('place')||new URLSearchParams(location.search).has('q')||new URLSearchParams(location.search).has('collection'))void activate();
