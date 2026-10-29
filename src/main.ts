// The catalog and map shell remain readable before a human starts the live map.
import { loadJapaneseFont } from './fonts.ts';
import './styles/growth.css';
let started=false;
function start(){
  if(started)return;started=true;document.querySelector('[data-map-start]')?.remove();
  loadJapaneseFont();
  void import('./growth/map-widget.ts').then(()=>import('./app.ts')).then(({App})=>{
    new App().start();
    void import('./map-account.ts').catch(()=>{});
  }).catch(()=>{
    const message=document.querySelector('#loader-text');
    if(message)message.textContent='The shop catalog could not load. Reload the page to try again.';
    document.querySelector('.loader__steam')?.remove();
  });
}
let intent=false;
try{const stamp=Number(sessionStorage.getItem('soupmap:map-intent'));intent=stamp>0&&Date.now()-stamp<30000;sessionStorage.removeItem('soupmap:map-intent');}catch{}
if(intent)start();
else{
  const gate=document.createElement('section');gate.className='growth-map-start';gate.dataset.mapStart='';
  gate.innerHTML='<span class="directory-kicker">Soupmap / Find your next bowl</span><h2>A world of soup.<br>Yours to explore.</h2><p>Open the interactive map to explore restaurants, save places, and start your soup passport.</p><button type="button">Explore the live map →</button><a href="/catalog/">Browse the catalog</a>';
  gate.querySelector('button')!.addEventListener('click',start);document.body.append(gate);
}
