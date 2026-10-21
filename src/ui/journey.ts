import { CITIES } from '../data/cities.ts';
import { HUBS, collectionUrl, type Hub } from '../data/hubs.ts';
import { CURATED_SHOPS, ORDERED_SHOPS, shopBySlug, type Shop } from '../data/shops.ts';
import { PASSPORT_KEY, achievements, localDate, parseVisits, passportStats, validDate, type Visits } from '../passport.ts';
import { communityRequest, DRAFT_KEY, NOTE_LABELS, RECEIPTS_KEY, readReceipts, type Contribution, type NoteKind, type PublicNote, type Receipt } from '../community.ts';
import { $, esc } from './dom.ts';
import { icon } from './icons.ts';
import { toast } from './feedback.ts';
import { ApiError, requireSaveAccount } from '../personal-saves.ts';
import { accountEntries, putAccountEntry, deleteAccountEntry } from '../personal-entries.ts';

interface JourneyHost {
  select(slug:string):void;
  collection(slugs:readonly string[],hub?:Hub):void;
  city(slug:string):void;
  changed():void;
  saved():ReadonlySet<string>;
  saveCollection(slugs:readonly string[]):void;
}
type Page='hubs'|'passport'|'visit'|'contribute';
export class Journey {
  private readonly dialog=$<HTMLDialogElement>('#journey-dialog');
  private readonly content=$('#journey-content');
  visits:Visits=this.loadVisits();
  private receipts:Receipt[]=readReceipts();
  private page:Page='hubs';
  private focusedShop:string|null=null;
  private passportFilter='visited';
  private returnFocus:HTMLElement|null=null;
  private connected=false;
  private communityRequestId=0;
  private generation=0;
  private coverage:{shop:string;kind:NoteKind;count:number}[]=[];
  private notes:PublicNote[]=[];
  private newlyStamped:string|null=null;
  private accountDraft:Partial<Contribution>={};
  constructor(private readonly host:JourneyHost) {
    void this.refreshVisits();
    void accountEntries<Partial<Contribution>>("draft").then(entries=>{this.accountDraft=entries.community??{};}).catch(()=>{});
    window.addEventListener("soupmap:account-saves",()=>void this.refreshVisits());
    $('#hubs-tab').addEventListener('click',()=>this.show('hubs'));
    $('#passport-tab').addEventListener('click',()=>this.show('passport'));
    $('#contribute-btn').addEventListener('click',()=>this.showContribution());
    $('#journey-close').addEventListener('click',()=>this.close());
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    this.dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
    this.content.addEventListener('click',e=>void this.click(e));
    this.content.addEventListener('submit',e=>{e.preventDefault();void this.submit(e.target as HTMLFormElement);});
    this.content.addEventListener('input',e=>{
      const target=e.target as HTMLInputElement;
      if(target.closest('#field-note-form'))this.saveDraft(false);
    });
    this.content.addEventListener('change',e=>{
      const target=e.target as HTMLInputElement;
      if(target.id==='note-kind') {this.togglePlaceFields();this.saveDraft(false);}
      if(target.id==='note-shop'){
        const shop=shopBySlug.get(target.value);const city=$<HTMLInputElement>('#note-city');if(shop)city.value=shop.city;
        this.saveDraft(false);this.focusedShop=target.value;this.notes=[];this.renderNotes();void this.loadCommunity();
      }
      if(target.id==='passport-import')void this.importPassport(target.files?.[0]);
    });
    window.addEventListener('storage',e=>{
      if(e.key===PASSPORT_KEY||e.key===null){this.visits=this.loadVisits();this.host.changed();if(this.open&&this.page==='passport')this.renderPassport();}
      if(e.key===RECEIPTS_KEY||e.key===null){this.receipts=readReceipts();if(this.open&&this.page==='passport')this.renderPassport();}
    });
  }
  get open():boolean{return this.dialog.open;}
  private loadVisits():Visits {return {};}
  private async refreshVisits():Promise<void> {
    try {
      this.visits=await accountEntries<Visits[string]>("visit");
      this.host.changed();
      if(this.open&&this.page==="passport")this.renderPassport();
    } catch(error) {
      if(error instanceof ApiError&&error.status===401){this.visits={};this.host.changed();if(this.open&&this.page==="passport")this.renderPassport();}
    }
  }
  private async persistVisits():Promise<void> {
    await Promise.all(Object.entries(this.visits).map(([slug,visit])=>putAccountEntry("visit",slug,visit)));
    this.host.changed();
  }
  show(page:Page):void {
    this.generation++;
    this.page=page;
    if(!this.open){this.returnFocus=document.activeElement as HTMLElement;this.dialog.showModal();this.dialog.append($('#toast'));}
    if(page==='hubs'){this.renderHubs();void this.loadSuggestions();}
    if(page==='passport'){this.renderPassport();void this.refreshReceipts();void this.refreshVisits();}
    this.content.scrollTop=0;
    $('#journey-title').focus({preventScroll:true});
  }
  close():void {this.generation++;this.dialog.close();document.body.append($('#toast'));this.returnFocus?.focus({preventScroll:true});}
  private title(title:string,eyebrow:string):void {$('#journey-title').textContent=title;$('#journey-eyebrow').textContent=eyebrow;}
  private renderHubs():void {
    this.title('Take the long way.','THE CHAPTERS / JAPAN');
    this.content.innerHTML=`<div class="journey-intro"><p>Small collections, meaningful detours.<br>Explore at your own pace, over as many days as you like.</p><span class="journey-edition">07 cities<br>05 collections</span></div>
      <div class="chapter-cities">${CITIES.map(c=>`<button data-city-open="${c.slug}"><span lang="ja">${esc(c.nameJa)}</span><strong>${esc(c.name)}</strong><small>${ORDERED_SHOPS.filter(s=>s.city===c.name).length} places in the guide ↗</small></button>`).join('')}</div>
      <div class="journey-section-heading"><h3>Follow a thread.</h3><span>COLLECTIONS TO KEEP</span></div>
      <div class="hub-grid">${HUBS.map((h,i)=>{const count=h.stops.filter(s=>this.visits[s]).length;return `<article class="hub-card" style="--stamp:${h.color}"><div class="hub-cover"><span class="hub-number">CHAPTER ${String(i+1).padStart(2,'0')}</span><span class="hub-kanji" lang="ja">${h.kanji}</span><span class="hub-seal" aria-label="${count} of ${h.stops.length} visited">${count}/${h.stops.length}</span></div><div class="hub-copy"><span class="eyebrow">${esc(h.subtitle)}</span><h3>${esc(h.title)}</h3><p>${esc(h.description)}</p><progress value="${count}" max="${h.stops.length}" aria-label="${count} of ${h.stops.length} visited"></progress><div class="hub-actions"><button class="btn btn--primary" data-hub="${h.slug}">Explore ${h.stops.length} places ${icon('arrow')}</button><button class="btn" data-hub-share="${h.slug}" aria-label="Share ${esc(h.title)}">${icon('link')}</button></div></div></article>`;}).join('')}</div>
      <section id="community-suggestions" hidden></section>
      <section class="chapter-mission"><span class="mission-mark" lang="ja">助</span><div><span class="eyebrow">HELP WRITE THE NEXT CHAPTER</span><h3>Know a place we’re missing?</h3><p>Send a map link and tell us why it belongs. Suggestions are reviewed before appearing in the community guide.</p></div><button class="btn" data-contribute="place">Suggest a place ↗</button></section>`;
  }
  private async loadSuggestions():Promise<void> {
    const generation=this.generation;
    try {
      const suggestions=await communityRequest<PublicNote[]>('places');
      if(generation!==this.generation||!suggestions.length)return;
      const section=$('#community-suggestions');section.hidden=false;
      section.innerHTML=`<div class="journey-section-heading"><h3>The next chapter.</h3><span>COMMUNITY SUGGESTIONS</span></div><p class="form-hint">Reviewed suggestions from travelers. Locations and shop details still need independent verification before joining the map.</p>${suggestions.map(n=>`<article class="field-note"><span class="eyebrow">${esc(n.city)}</span><h3>${esc(n.placeName)}</h3><p>${esc(n.body)}</p><small>Suggested by ${esc(n.author)}</small><p><a href="${esc(n.mapUrl)}" target="_blank" rel="noopener noreferrer">View suggested place ↗</a></p></article>`).join('')}`;
    }catch{/* The static chapters remain useful when the community service is offline. */}
  }
  private renderPassport():void {
    this.title('Your Soup Passport.','COLLECT MEMORIES / NOT POINTS');
    const stats=passportStats(this.visits);const accepted=this.receipts.filter(r=>r.status==='approved').length;
    const selected=this.passportFilter==='saved'?[...this.host.saved()]:Object.keys(this.visits).filter(slug=>this.passportFilter!=='favorites'||this.visits[slug]?.wouldReturn);
    const shops=selected.flatMap(s=>shopBySlug.get(s)??[]).sort((a,b)=>(this.visits[b.slug]?.date??'').localeCompare(this.visits[a.slug]?.date??''));
    this.content.innerHTML=`<section class="passport-cover"><div><span class="eyebrow">SOUPMAP / PERSONAL FIELD RECORD</span><h3>Every bowl,<br><em>a little story.</em></h3><p>Keep your visits and private notes in your account.<br>Your bowl memories, ready on any device.</p></div><div class="passport-emblem"><span lang="ja">湯</span><small>THE SOUP PASSPORT</small></div><div class="passport-stats"><span><strong>${stats.bowls}</strong>places visited</span><span><strong>${stats.cities}</strong>cities explored</span><span><strong>${stats.styles}</strong>broth styles</span></div></section>
      <div class="passport-tools"><button class="btn" data-passport-share ${stats.bowls?'':'disabled'}>${icon('link')}Share visited places</button><button class="btn" data-download-card ${stats.bowls?'':'disabled'}>Download share card</button><button class="text-btn" data-export>Export backup</button><label class="text-btn import-label">Import backup<input id="passport-import" type="file" accept="application/json,.json" aria-label="Import passport backup"></label></div>
      <p class="share-privacy">Sharing includes only your visited shop list. Your dates, notes, and contribution receipts stay private.</p>
      <div class="journey-section-heading"><h3>A few milestones.</h3><span>NO DEADLINES. NO STREAKS.</span></div>
      <div class="achievement-grid">${achievements(this.visits,accepted).map(a=>`<article class="achievement ${a.unlocked?'is-earned':''}"><span class="achievement-stamp" lang="ja">${a.symbol}</span><div><strong>${a.title}</strong><p>${a.detail}</p><small>${a.unlocked?'Collected':`${a.count} / ${a.target}`}</small></div></article>`).join('')}</div>
      <div class="passport-tabs" role="group" aria-label="Passport collection">${[['visited','Visited'],['favorites','Would return'],['saved','Want to go']].map(([id,label])=>`<button data-passport-filter="${id}" aria-pressed="${this.passportFilter===id}">${label}</button>`).join('')}</div>
      <div class="stamp-grid">${shops.length?shops.map(shop=>{const v=this.visits[shop.slug];const city=CITIES.find(c=>c.name===shop.city);return `<article class="visit-stamp ${this.newlyStamped===shop.slug?'just-stamped':''}"><span class="stamp-city" lang="ja">${esc(city?.nameJa??'日本')}</span><span class="stamp-date">${v?esc(v.date):'ON YOUR LIST'}</span><h3>${esc(shop.name)}</h3><span class="micro">${esc(shop.city)} · ${v?.wouldReturn?'Would return ♥':esc(shop.signatureBowl)}</span>${v?.bowl?`<p class="visit-bowl">${esc(v.bowl)}</p>`:''}${v?.note?`<p class="visit-note">${esc(v.note)}</p>`:''}<div class="stamp-actions"><button class="text-btn" data-visit="${shop.slug}">${v?'Edit visit':'Collect a stamp'}</button><button class="text-btn" data-open-shop="${shop.slug}">On the map ↗</button></div></article>`;}).join(''):`<div class="passport-empty"><span lang="ja">旅</span><h3>${this.passportFilter==='favorites'?'Some places are worth a second bowl.':this.passportFilter==='saved'?'Make a little room for discovery.':'Your first chapter starts with a bowl.'}</h3><p>${this.passportFilter==='favorites'?'Mark “I would return” when recording a visit.':'Explore the guide, then record a visit whenever you’re ready.'}</p><button class="btn" data-show-hubs>Explore the chapters ↗</button></div>`}</div>
      ${this.receipts.length?`<section class="contribution-history"><h3>Your field notes</h3><p>Reviewed notes unlock “A helpful hand.” Status is checked when you open your passport.</p>${this.receipts.map(r=>`<div><span>${esc(r.label)}</span><span class="status-tag">${esc(r.status)}</span></div>`).join('')}</section>`:''}`;
    this.newlyStamped=null;
  }
  showVisit(shop:Shop):void {
    this.focusedShop=shop.slug;this.show('visit');this.title('A bowl worth remembering.','YOUR PASSPORT / NEW MEMORY');
    const visit=this.visits[shop.slug];
    this.content.innerHTML=`<div class="form-intro"><span class="stamp-mini" lang="ja">湯</span><div><h3>${esc(shop.name)}</h3><p>${esc(shop.neighborhood)}, ${esc(shop.city)}</p></div></div><form id="visit-form" class="journey-form"><label>When did you visit?<input name="date" type="date" value="${visit?.date??localDate()}" min="1900-01-01" max="${localDate()}" required></label><label>What did you order? <small>Optional</small><input name="bowl" maxlength="120" value="${esc(visit?.bowl??'')}" placeholder="The bowl you want to remember"></label><label>A note for yourself <small>Private · optional</small><textarea name="note" maxlength="400" placeholder="What made this visit memorable?">${esc(visit?.note??'')}</textarea></label><label class="check-label"><input name="wouldReturn" type="checkbox" ${visit?.wouldReturn?'checked':''}>I would return for another bowl</label><p class="form-hint">Visits are self-reported. One stamp per place; revisit this memory any time to edit it.</p><div class="form-actions"><button class="btn btn--primary" type="submit">${visit?'Save this memory':'Stamp my passport'}</button>${visit?'<button type="button" class="text-btn" data-remove-visit>Remove visit</button>':''}</div><p class="form-message" role="status"></p></form>`;
  }
  showContribution(shop?:Shop,kind:NoteKind='tip'):void {
    this.focusedShop=shop?.slug??null;this.show('contribute');this.title('Leave something useful.','FIELD NOTES / COMMUNITY GUIDE');
    this.connected=false;this.coverage=[];this.notes=[];
    let draft:Partial<Contribution>={...this.accountDraft};
    if(shop)draft={...(draft.shop===shop.slug?draft:{author:draft.author}),shop:shop.slug,city:shop.city,kind};
    if(kind==='place')draft={...(draft.kind==='place'?draft:{author:draft.author}),kind:'place',shop:''};
    const selected=shopBySlug.get(typeof draft.shop==='string'?draft.shop:'')??shop??ORDERED_SHOPS[0]!;
    this.focusedShop=selected.slug;
    const selectable=[selected,...CURATED_SHOPS.filter(s=>s.slug!==selected.slug)];
    const selectedKind=Object.keys(NOTE_LABELS).includes(draft.kind??'')?draft.kind!:kind;
    const value=(v:unknown)=>typeof v==='string'?esc(v):'';
    this.content.innerHTML=`<div class="journey-intro"><p>A useful detail can make someone else’s day.<br>Short, specific, and based on your own experience.</p></div><p id="community-status" class="community-status" role="status">Checking the community guide…</p><div id="community-missions"></div>
      <form id="field-note-form" class="journey-form"><label>What would you like to share?<select id="note-kind" name="kind">${Object.entries(NOTE_LABELS).map(([id,label])=>`<option value="${id}" ${id===selectedKind?'selected':''}>${label}</option>`).join('')}</select></label>
      <label id="note-shop-field">Place in the guide<select id="note-shop" name="shop">${selectable.map(s=>`<option value="${s.slug}" ${selected.slug===s.slug?'selected':''}>${esc(s.name)} · ${esc(s.city)}</option>`).join('')}</select></label>
      <div id="new-place-fields" hidden><label>Place name<input name="placeName" maxlength="100" value="${value(draft.placeName)}" placeholder="The shop’s name"></label><label>City<input id="note-city" name="city" maxlength="80" value="${value(draft.city)||esc(selected.city)}" placeholder="Which city?"></label><label>Google Maps or OpenStreetMap link<input name="mapUrl" type="url" maxlength="1000" value="${value(draft.mapUrl)}" placeholder="https://…"></label></div>
      <label>Your field note<textarea name="body" minlength="15" maxlength="600" required placeholder="What should the next person know?">${value(draft.body)}</textarea></label>
      <label>When was this? <small>Required for personal observations</small><input name="date" type="date" min="1900-01-01" max="${localDate()}" value="${value(draft.date)}"></label>
      <label>Credit this note to <small>Public · optional</small><input name="author" maxlength="40" value="${value(draft.author)}" placeholder="A name or nickname"></label>
      <label class="honeypot" aria-hidden="true">Leave this blank<input name="website" tabindex="-1" autocomplete="off"></label>
      <label class="check-label"><input name="consent" type="checkbox">I’m happy for this note and display name to appear publicly after review.</label>
      <p class="form-hint">Please leave out private contact details. Notes are individual experiences; corrections and suggested places are reviewed before publication. Publishing a correction does not automatically verify the shop’s directory details.</p>
      <div class="form-actions"><button id="note-submit" class="btn btn--primary" type="submit" disabled>Checking availability…</button><button type="button" class="text-btn" data-save-draft>Save draft</button></div><p class="form-message" role="status"></p></form><section id="public-field-notes"></section>`;
    this.togglePlaceFields();void this.loadCommunity();
  }
  private togglePlaceFields():void {
    const kind=$<HTMLSelectElement>('#note-kind').value;const place=kind==='place';
    $('#new-place-fields').hidden=!place;$('#note-shop-field').hidden=place;
    for(const input of this.content.querySelectorAll<HTMLInputElement>('#new-place-fields input'))input.required=place;
    this.content.querySelector<HTMLInputElement>('[name="date"]')!.required=kind==='observation';
  }
  private draft():Contribution & {consent:boolean;website:string} {
    const form=$<HTMLFormElement>('#field-note-form');const get=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).value;
    const shop=shopBySlug.get(get('shop'));
    return {shop:get('kind')==='place'?'':get('shop'),city:get('kind')==='place'?get('city'):shop?.city??get('city'),kind:get('kind') as NoteKind,body:get('body'),author:get('author'),date:get('date'),placeName:get('placeName'),mapUrl:get('mapUrl'),consent:(form.elements.namedItem('consent') as HTMLInputElement).checked,website:get('website')};
  }
  private saveDraft(announce=true):void {
    // Typing is not consent to save. Keep the form in memory until an explicit click.
    if(!announce)return;
    void requireSaveAccount("note").then(async ready=>{
      if(!ready)return;
      const {consent:_,website:__,...draft}=this.draft();
      await putAccountEntry("draft","community",draft);
      this.accountDraft=draft;
      toast("Draft saved privately to your account. Not submitted.");
    }).catch(()=>toast("Your draft could not be saved. Keep this page open and retry.",4500));
  }
  private async loadCommunity():Promise<void> {
    const generation=this.generation;
    const requestId=++this.communityRequestId;
    try {
      const status=await communityRequest<{enabled:boolean}>('status');
      if(generation!==this.generation||requestId!==this.communityRequestId)return;
      this.connected=status.enabled;
      $('#community-status').textContent=status.enabled?'Notes are reviewed before they become public.':'Public contributions are not connected yet. You can save a private draft here.';
      const button=$<HTMLButtonElement>('#note-submit');button.disabled=!status.enabled;button.textContent=status.enabled?'Send for review':'Submission unavailable';
      if(!status.enabled)return;
      const [coverage,notes]=await Promise.all([communityRequest<typeof this.coverage>('coverage'),this.focusedShop?communityRequest<PublicNote[]>(`notes&shop=${encodeURIComponent(this.focusedShop)}`):Promise.resolve([])]);
      if(generation!==this.generation||requestId!==this.communityRequestId)return;
      this.coverage=coverage;this.notes=notes;this.renderMissions();this.renderNotes();
    }catch{
      if(generation!==this.generation||requestId!==this.communityRequestId)return;
      $('#community-status').textContent='The community guide is unavailable. Keep this page open, or sign in to save a private draft.';
      const button=$<HTMLButtonElement>('#note-submit');button.disabled=true;button.textContent='Submission unavailable';this.connected=false;
    }
  }
  private renderMissions():void {
    const shops=this.focusedShop?[shopBySlug.get(this.focusedShop)!]:ORDERED_SHOPS.filter(s=>s.city==='Tokyo');
    const missing=shops.filter(s=>!this.coverage.some(n=>n.shop===s.slug&&n.kind==='order'));
    $('#community-missions').innerHTML=missing.length?`<div class="mission-strip"><span class="eyebrow">HELP COMPLETE THE CHAPTER</span><p>${missing.length} ${missing.length===1?'place needs':'places need'} an ordering tip.</p>${missing.map(s=>`<button class="text-btn" data-mission="${s.slug}">${esc(s.name)} ↗</button>`).join('')}</div>`:'<div class="mission-strip"><span class="eyebrow">ORDERING TIPS COLLECTED</span><p>Have a different detail to add? Every useful observation helps.</p></div>';
  }
  private renderNotes():void {
    $('#public-field-notes').innerHTML=`<div class="journey-section-heading"><h3>From the field.</h3><span>REVIEWED COMMUNITY NOTES</span></div>${this.notes.length?this.notes.map(n=>`<article class="field-note"><span class="eyebrow">${esc(NOTE_LABELS[n.kind])}</span><p>${esc(n.body)}</p><small>By ${esc(n.author)} · ${esc(n.date||n.createdAt.slice(0,10))}</small></article>`).join(''):'<p class="form-hint">No reviewed notes here yet. Yours could help someone find their way.</p>'}`;
  }
  private async submit(form:HTMLFormElement):Promise<void> {
    if(form.id==='visit-form') {
      if(!this.focusedShop)return;
      try {if(!await requireSaveAccount("visit"))return;}
      catch {form.querySelector('.form-message')!.textContent="Your account could not be reached. Please retry.";return;}
      const get=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).value;
      if(!validDate(get('date'))){form.querySelector('.form-message')!.textContent='Choose a valid visit date, today or earlier.';return;}
      const visit={date:get('date'),bowl:get('bowl').slice(0,120),note:get('note').slice(0,400),wouldReturn:(form.elements.namedItem('wouldReturn') as HTMLInputElement).checked};
      try {
        await putAccountEntry("visit",this.focusedShop,visit);
        this.visits[this.focusedShop]=visit;this.host.changed();this.newlyStamped=this.focusedShop;this.passportFilter='visited';this.show('passport');toast('Memory saved to your account passport.');
      } catch {form.querySelector('.form-message')!.textContent="Your memory could not be saved. Keep this page open and retry.";}
      return;
    }
    if(form.id==='field-note-form'){
      this.saveDraft(false);if(!this.connected)return;
      let draftSnapshot:string|null=null;try{draftSnapshot=localStorage.getItem(DRAFT_KEY);}catch{/* no persistent storage */}
      const n=this.draft();const message=form.querySelector<HTMLElement>('.form-message')!;
      if(!n.consent){message.textContent='Please confirm you want this note and display name to be public after review.';return;}
      const button=$<HTMLButtonElement>('#note-submit');button.disabled=true;button.textContent='Sending…';
      try{
        const receipt=await communityRequest<Omit<Receipt,'label'>>('submit',{method:'POST',body:JSON.stringify(n)});
        this.receipts=[...this.receipts,{...receipt,label:n.kind==='place'?n.placeName:shopBySlug.get(n.shop)?.name??n.city}].slice(-100);
        try{localStorage.setItem(RECEIPTS_KEY,JSON.stringify(this.receipts));if(localStorage.getItem(DRAFT_KEY)===draftSnapshot)localStorage.removeItem(DRAFT_KEY);}catch{toast('Submitted, but this browser could not save your tracking receipt.',4500);}
        if(!form.isConnected)return;
        message.textContent='Received. Your note is pending review; check its status in your passport.';
        button.textContent='Sent for review';(form.elements.namedItem('body') as HTMLTextAreaElement).value='';
      }catch(error){if(!form.isConnected)return;message.textContent=error instanceof Error?error.message:'Could not submit. Keep this page open and try again.';button.disabled=false;button.textContent='Try again';}
    }
  }
  private async refreshReceipts():Promise<void> {
    const generation=this.generation;
    if(!this.receipts.length)return;
    const results=await Promise.allSettled(this.receipts.map(async r=>({...r,...await communityRequest<{status:Receipt['status']}>('receipt',{method:'POST',body:JSON.stringify({id:r.id,token:r.token})})})));
    if(generation!==this.generation)return;
    this.receipts=results.map((r,i)=>r.status==='fulfilled'?r.value:this.receipts[i]!).filter(Boolean);
    try{localStorage.setItem(RECEIPTS_KEY,JSON.stringify(this.receipts));}catch{/* memory remains usable */}
    if(this.open&&this.page==='passport')this.renderPassport();
  }
  private async click(event:MouseEvent):Promise<void> {
    const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
    const d=target.dataset;
    if(d.hub){const hub=HUBS.find(h=>h.slug===d.hub);if(hub){this.close();this.host.collection(hub.stops,hub);}}
    if(d.hubShare){const hub=HUBS.find(h=>h.slug===d.hubShare)!;await this.copy(collectionUrl(location.origin,hub.stops,hub.slug));}
    if(d.cityOpen){this.close();this.host.city(d.cityOpen);}
    if(d.openShop){this.close();this.host.select(d.openShop);}
    if(d.visit){const shop=shopBySlug.get(d.visit);if(shop)this.showVisit(shop);}
    if('showHubs'in d)this.show('hubs');
    if('contribute'in d)this.showContribution(undefined,(d.contribute||'tip') as NoteKind);
    if('passportFilter'in d){this.passportFilter=d.passportFilter!;this.renderPassport();}
    if('removeVisit'in d&&this.focusedShop){
      try {if(!await requireSaveAccount("visit"))return;await deleteAccountEntry("visit",this.focusedShop);delete this.visits[this.focusedShop];this.host.changed();this.show('passport');toast('Visit removed.');}
      catch {toast("Your visit could not be removed. Please retry.");}
    }
    if('saveDraft'in d)this.saveDraft();
    if(d.mission){const shop=shopBySlug.get(d.mission);if(shop){$<HTMLSelectElement>('#note-shop').value=shop.slug;$<HTMLSelectElement>('#note-kind').value='order';$<HTMLInputElement>('#note-city').value=shop.city;this.togglePlaceFields();this.saveDraft(false);this.content.querySelector<HTMLTextAreaElement>('[name="body"]')?.focus();}}
    if('passportShare'in d)await this.copy(collectionUrl(location.origin,Object.keys(this.visits)));
    if('export'in d)this.download('soupmap-passport.json',JSON.stringify({version:1,visits:this.visits},null,2),'application/json');
    if('downloadCard'in d)this.downloadCard();
  }
  private async copy(url:string):Promise<void>{try{await navigator.clipboard.writeText(url);toast('Collection link copied.');}catch{this.showShareLink(url);}}
  private showShareLink(url:string):void {
    const input=document.createElement('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','Collection link; copy this address');input.className='share-link';this.content.prepend(input);input.focus();input.select();toast('Copy the selected collection link.');
  }
  private download(name:string,data:string,type:string):void {
    const url=URL.createObjectURL(new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private async importPassport(file?:File):Promise<void> {
    if(!file)return;
    try {if(!await requireSaveAccount("visit"))return;}catch{toast("Your account could not be reached. Please retry.");return;}
    if(file.size>100000){toast('Choose a passport backup smaller than 100 KB.');return;}
    try {const data=JSON.parse(await file.text());if(data.version!==1||!data.visits)throw Error();const imported=parseVisits(JSON.stringify(data.visits));if(!Object.keys(imported).length)throw Error();
      // Existing memories win; importing a backup cannot overwrite newer local notes.
      this.visits={...imported,...this.visits};await this.persistVisits();this.renderPassport();toast('Backup imported to your account. Existing memories were kept.');
    }catch{toast('That file is not a valid Soupmap passport backup.');}
  }
  private downloadCard():void {
    const stats=passportStats(this.visits);const shops=Object.keys(this.visits).flatMap(s=>shopBySlug.get(s)??[]);const url=collectionUrl(location.origin,shops.map(s=>s.slug));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500"><rect width="1200" height="1500" fill="#f3f0e5"/><rect x="45" y="45" width="1110" height="1410" rx="8" fill="none" stroke="#b8bba8"/><g fill="#293628" font-family="Georgia,serif"><text x="100" y="150" font-size="52">soupmap.</text><text x="100" y="320" font-size="88">Every bowl,</text><text x="100" y="420" font-size="88" font-style="italic" fill="#aa4731">a little story.</text><text x="100" y="530" font-family="sans-serif" font-size="24">${stats.bowls} PLACES · ${stats.cities} CITIES · ${stats.styles} BROTH STYLES</text>${shops.slice(0,10).map((s,i)=>`<text x="100" y="${650+i*58}" font-size="30">${String(i+1).padStart(2,'0')} / ${esc(s.name)} · ${esc(s.city)}</text>`).join('')}<text x="100" y="1280" font-size="26">${shops.length>10?`+ ${shops.length-10} more places. `:''}My Soup Passport / Japan</text><text x="100" y="1340" font-family="sans-serif" font-size="20">Explore the collection at ${esc(location.host)}</text></g><a href="${esc(url)}"><text x="100" y="1395" fill="#aa4731" font-family="sans-serif" font-size="21">Open my collection ↗</text></a></svg>`;
    this.download('soupmap-my-bowl-trail.svg',svg,'image/svg+xml');toast('Share card downloaded. Copy the collection link to share alongside it.');
  }
}
