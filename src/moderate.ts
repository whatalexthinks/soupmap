import '@fontsource-variable/fraunces/soft.css';
import '@fontsource-variable/instrument-sans';
import './styles/tokens.css';
import './styles/atlas.css';
import './styles/journey.css';
import './styles/moderate.css';
import { communityRequest, NOTE_LABELS, type PublicNote } from './community.ts';
import { $,esc } from './ui/dom.ts';
import { shopBySlug } from './data/shops.ts';
type ReviewNote=PublicNote & {status:'pending'|'approved'|'rejected'};
let token='';let rows:ReviewNote[]=[];let generation=0;
const status=$('#review-status');
function render():void {
  const filter=$<HTMLSelectElement>('#review-filter').value;
  const visible=rows.filter(r=>filter==='all'||r.status===filter);
  $('#review-list').innerHTML=visible.length?visible.map(n=>`<article class="review-note"><header><span class="eyebrow">${esc(NOTE_LABELS[n.kind])} / ${esc(n.city)}</span><span class="status-tag">${esc(n.status)}</span></header><h2>${esc(n.kind==='place'?n.placeName:shopBySlug.get(n.shop)?.name??n.shop)}</h2><p>${esc(n.body)}</p><small>${esc(n.author)} · ${esc(n.date||n.createdAt.slice(0,10))}</small>${n.mapUrl?`<p><a href="${esc(n.mapUrl)}" target="_blank" rel="noopener noreferrer">Inspect suggested place ↗</a></p><p class="form-hint">Publishing adds this to community suggestions. Add it to shops.json only after verifying the location and directory fields.</p>`:''}<div class="form-actions">${n.status!=='approved'?`<button class="btn btn--primary" data-review="approved" data-id="${n.id}">Publish ${n.kind==='place'?'suggestion':'note'}</button>`:''}${n.status!=='rejected'?`<button class="btn" data-review="rejected" data-id="${n.id}">${n.status==='approved'?'Unpublish':'Reject'}</button>`:''}</div></article>`).join(''):'<p class="review-empty">Nothing here to review.</p>';
}
async function load():Promise<void>{
  const request=++generation;status.textContent='Loading the review queue…';
  try{const data=await communityRequest<ReviewNote[]>('queue',{headers:{Authorization:`Bearer ${token}`}});if(request!==generation)return;rows=data;$('#moderator-login').hidden=true;$('#review-workspace').hidden=false;status.textContent=`${rows.filter(r=>r.status==='pending').length} pending in the latest ${rows.length} submissions.`;render();}
  catch(e){if(request===generation)status.textContent=e instanceof Error?e.message:'Could not load the queue.';}
}
$('#moderator-login').addEventListener('submit',e=>{e.preventDefault();const input=$<HTMLInputElement>('[name="token"]');token=input.value.trim();input.value='';void load();});
$('#review-filter').addEventListener('change',render);
$('#review-refresh').addEventListener('click',()=>void load());
$('#review-logout').addEventListener('click',()=>{generation++;token='';rows=[];$('#review-list').innerHTML='';$('#review-workspace').hidden=true;$('#moderator-login').hidden=false;status.textContent='Review desk locked.';});
$('#review-list').addEventListener('click',async e=>{
  const button=(e.target as Element).closest<HTMLButtonElement>('[data-review]');if(!button)return;
  const note=rows.find(r=>r.id===button.dataset.id);if(!note)return;
  const request=generation;button.disabled=true;
  try{await communityRequest('review',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify({id:note.id,status:button.dataset.review,expected:note.status})});if(request===generation)await load();}
  catch(error){if(request!==generation)return;status.textContent=error instanceof Error?error.message:'Could not review.';button.disabled=false;}
});
