import { passportWidget } from './render.ts';
import { mountGrowth } from './client.ts';
import '../styles/growth.css';
import { cityBySlug } from '../data/cities.ts';
const box=document.createElement('details');box.className='growth-map-passport';
let current={city:cityBySlug.get(new URL(location.href).searchParams.get('city') ?? '')?.name ?? 'Tokyo',slug:''};
function render(){box.innerHTML=`<summary>Winter Soup Passport · 5 bowls ↗</summary>${passportWidget(current.city,current.slug)}`;mountGrowth(box);}
render();document.body.append(box);
if(new URL(location.href).searchParams.get('passport')==='1')box.open=true;
window.addEventListener('soupmap:place-selected',event=>{current=(event as CustomEvent).detail;render();});
window.addEventListener('soupmap:city-selected',event=>{const city=(event as CustomEvent).detail;if(city){current={city,slug:''};render();}});
