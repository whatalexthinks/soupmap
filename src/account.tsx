import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Router as WouterRouter, Route, Switch, useLocation } from "wouter";
import { api, setAccountSaved, type PersonalList } from "./personal-saves.ts";
import { shortlistHash, SHORTLIST_LIMIT } from "./shortlist.ts";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}
const appearance = {
  theme: shadcn,
  options: {
    logoPlacement:"inside" as const, logoLinkUrl:"/",
    logoImageUrl:`${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary:"#b7442c", colorForeground:"#292e27", colorMutedForeground:"#62675d",
    colorBackground:"#faf8f0", colorInput:"#fffefa", colorInputForeground:"#292e27",
    colorDanger:"#a72a22", colorNeutral:"#292e27",
    fontFamily:'"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    borderRadius:"10px",
  },
  elements: {
    rootBox:{width:"100%",display:"flex",justifyContent:"center"},
    cardBox:{background:"#faf8f0",width:"440px",maxWidth:"100%",borderRadius:"16px"},
    card:{background:"transparent",boxShadow:"none"},footer:{background:"transparent"},
    headerTitle:{color:"#292e27",fontSize:"27px",lineHeight:"1.15",letterSpacing:"-0.7px"}, headerSubtitle:{color:"#62675d"},
    socialButtonsBlockButtonText:{color:"#292e27"}, formFieldLabel:{color:"#292e27"},
    footerActionLink:{color:"#9b341f"}, footerActionText:{color:"#62675d"},
    dividerText:{color:"#62675d"}, identityPreviewEditButton:{color:"#9b341f"},
    formFieldSuccessText:{color:"#32613a"}, alertText:{color:"#a72a22"},
    formButtonPrimary:{background:"#b7442c",color:"#ffffff"},
    formFieldInput:{background:"#fffefa",color:"#292e27",borderColor:"#d2d4c7"},
  },
};

function Provider({children}:{children:ReactNode}) {
  const [,setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}
    appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    signInFallbackRedirectUrl="/account" signUpFallbackRedirectUrl="/account"
    localization={{
      signIn:{start:{title:"Welcome back to Soupmap",subtitle:"Your next bowl is waiting."}},
      signUp:{start:{title:"Make room for your next bowl",subtitle:"Create an account to keep your discoveries together."}},
    }}
    routerPush={to=>setLocation(stripBase(to))}
    routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    {children}
  </ClerkProvider>;
}

function AccountNav() {
  const {user,isLoaded} = useUser();
  const {signOut} = useClerk();
  const [error,setError] = useState("");
  useEffect(()=>{
    if (!isLoaded) return;
    let active=true;
    setAccountSaved(null);
    if (user) {
      if (location.pathname === "/" && !location.hash) {
        location.replace("/account");
        return;
      }
      void api<{lists:PersonalList[]}>("/me").then(data=>{
        if (active) setAccountSaved(user.id, data.lists.find(list=>list.kind==="saved")?.ids ?? []);
      }).catch(()=> { if(active) setError("Lists are offline. Open your account to retry."); });
    }
    return ()=>{active=false;};
  },[user?.id,isLoaded]);
  if (!isLoaded) return <a href="/sign-up">Create an account</a>;
  return <div className="account-mini">
    {user ? <><a href="/account">My lists</a><button type="button" onClick={()=>void signOut({redirectUrl:"/"})}>Sign out</button></>
      : <><a className="home-nav__signin" href="/sign-in">Sign in</a><a className="home-nav__signup" href="/sign-up">Join Soupmap</a></>}
    {error && <span role="status">{error}</span>}
  </div>;
}

type ShopSummary = {slug:string;name:string;city:string};

function Portal() {
  const {user,isLoaded} = useUser();
  const {signOut} = useClerk();
  const [lists,setLists] = useState<PersonalList[]>([]);
  const [selected,setSelected] = useState<string>("");
  const [busy,setBusy] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [listName,setListName] = useState("");
  const [rename,setRename] = useState("");
  const [deviceIds,setDeviceIds] = useState<string[]>([]);
  const [shopData,setShopData] = useState<Map<string,ShopSummary>>(new Map());
  const [catalogError,setCatalogError] = useState(false);
  const [search,setSearch] = useState("");
  const [sharing,setSharing] = useState(false);
  const [shareIds,setShareIds] = useState<string[]>([]);
  const [shareUrl,setShareUrl] = useState("");

  async function refresh(): Promise<void> {
    const result=await api<{lists:PersonalList[]}>("/me");
    setLists(result.lists);
    setSelected(current=> result.lists.some(list=>list.id===current) ? current : result.lists[0]?.id ?? "");
    if(user) setAccountSaved(user.id,result.lists.find(list=>list.kind==="saved")?.ids ?? []);
    setLoaded(true);
  }
  async function action(work:()=>Promise<void>,message="Changes saved."):Promise<void> {
    if (busy) return;
    setBusy(true);setError("");setNotice("");setShareUrl("");
    try { await work();await refresh();setNotice(message); }
    catch(err) {setError(err instanceof Error ? err.message : "Your changes could not be saved.");}
    finally {setBusy(false);}
  }
  useEffect(()=>{
    setLists([]);setLoaded(false);setError("");setSelected("");setSharing(false);
    if (!user) return;
    let active=true;
    void api<{lists:PersonalList[]}>("/me").then(data=>{
      if(!active)return;
      setLists(data.lists);setSelected(data.lists[0]?.id??"");setLoaded(true);
      setAccountSaved(user.id,data.lists.find(list=>list.kind==="saved")?.ids??[]);
    }).catch(()=>{if(active)setError("Your lists could not load. Check your connection and retry.");});
    // Resolve names on this page without initializing the map or WebGL.
    void import("./data/shops.ts").then(({shopBySlug})=>{
      if(!active)return;
      setShopData(new Map([...shopBySlug].map(([id,shop])=>[id,{slug:id,name:shop.name,city:shop.city}])));
    }).catch(()=>{if(active)setCatalogError(true);});
    try {
      const stored=JSON.parse(localStorage.getItem("soupmap:saved:v1")||"[]");
      if(Array.isArray(stored))setDeviceIds([...new Set(stored.filter((id):id is string=>typeof id==="string"))].slice(0,1000));
    } catch {setDeviceIds([]);}
    return ()=>{active=false;setAccountSaved(null);};
  },[user?.id]);
  const list=lists.find(item=>item.id===selected);
  useEffect(()=>{setRename(list?.name??"");setSharing(false);setShareIds([]);setShareUrl("");},[selected]);
  const namesReady=shopData.size>0;
  const alreadySaved=new Set(lists.find(item=>item.kind==="saved")?.ids??[]);
  const importIds=deviceIds.filter(id=>shopData.has(id)&&!alreadySaved.has(id));
  const candidates=search.trim().length>=2 ? [...shopData.values()].filter(shop=>
    `${shop.name} ${shop.city}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    &&!list?.ids.includes(shop.slug)).slice(0,8) : [];

  if (!isLoaded) return <p className="account-loading" role="status">Loading your account…</p>;
  if (!user) return <section className="account-intro">
    <p className="account-eyebrow">YOUR NEXT BOWL STARTS HERE</p><h1>Good discoveries deserve a place to stay.</h1>
    <p>Create an email account to keep personal lists across devices. Or explore first—no account needed.</p>
    <div className="account-actions"><a className="account-primary" href="/sign-up">Create your account</a>
    <a href="/sign-in">Already a member? Sign in</a><a href="/map/">Explore the map ↗</a></div>
  </section>;
  return <div className="portal">
    <div className="portal-heading"><div><p className="account-eyebrow">YOUR PERSONAL SOUP ATLAS</p>
      <h1>A place for every next bowl.</h1><p>Your lists are private. Sharing is always your choice.</p></div>
      <button type="button" onClick={()=>void signOut({redirectUrl:"/"})}>Sign out</button></div>
    {error&&<div className="account-error" role="alert">{error} <button disabled={busy} onClick={()=>void action(async()=>{}, "Lists refreshed.")}>Retry</button></div>}
    {notice&&<p role="status" className="account-notice">{notice}</p>}
    {!loaded&&!error&&<p role="status">Loading your lists…</p>}
    {namesReady&&importIds.length>0&&<aside className="device-import"><strong>{importIds.length} saved places on this browser</strong>
      <p>Bring these into your account? This adds to Saved places without replacing anything. Your device saves stay intact.</p>
      <button disabled={busy} onClick={()=>void action(async()=>{
        await api("/import-saves","POST",{ids:importIds,add:true});
      },"Device saves added to your account.")}>Import device saves</button>
      <button disabled={busy} onClick={()=>setDeviceIds([])}>Not now</button></aside>}
    <div className="portal-grid">
      <aside className="list-sidebar"><h2>Your lists</h2>
        <nav aria-label="Personal lists">{lists.map(item=><button key={item.id} type="button"
          aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}>
          <span>{item.name}</span><small>{item.ids.length}</small></button>)}</nav>
        <form onSubmit={e=>{e.preventDefault();void action(async()=>{
          const data=await api<{list:PersonalList}>("/lists","POST",{name:listName});setListName("");setSelected(data.list.id);
        },"New list created.");}}>
          <label htmlFor="new-list">Make a new list</label>
          <input id="new-list" required minLength={1} maxLength={80} value={listName} onChange={e=>setListName(e.target.value)}
            placeholder="A weekend in Tokyo"/>
          <button disabled={busy||!loaded||!listName.trim()} type="submit">Create list</button>
        </form>
      </aside>
      <section className="list-content" aria-labelledby="list-heading">
        {list ? <>
          <div className="list-title"><div><p className="account-eyebrow">{list.kind==="saved"?"YOUR BOOKMARKS":"PERSONAL COLLECTION"}</p>
            <h2 id="list-heading">{list.name}</h2><p>{list.ids.length} saved {list.ids.length===1?"place":"places"}</p></div>
            <button disabled={!list.ids.length} onClick={()=>{setSharing(!sharing);setShareIds([]);setShareUrl("");}}>Share selected places</button></div>
          {list.kind==="custom"&&<details className="list-settings"><summary>Rename or delete this list</summary>
            <form onSubmit={e=>{e.preventDefault();void action(async()=>{
              await api(`/lists/${list.id}`,"PATCH",{name:rename});
            },"List renamed.");}}><label htmlFor="rename-list">List name</label>
              <input id="rename-list" value={rename} maxLength={80} required onChange={e=>setRename(e.target.value)}/>
              <button disabled={busy||!rename.trim()}>Save name</button></form>
            <button className="danger" disabled={busy} onClick={()=>{
              if(confirm(`Delete “${list.name}” and its list entries? This does not remove shops from your other lists.`)){
                void action(async()=>{await api(`/lists/${list.id}`,"DELETE",{});},"List deleted.");
              }
            }}>Delete this list</button></details>}
          {sharing&&<aside className="list-share"><h3>Choose what to share</h3>
            <p>Nothing is selected automatically. Choose up to {SHORTLIST_LIMIT} places. Anyone with the link can view this snapshot; it cannot be revoked and later edits do not update it.</p>
            {list.ids.map(id=><label key={id}><input type="checkbox" checked={shareIds.includes(id)}
              disabled={!shareIds.includes(id)&&shareIds.length>=SHORTLIST_LIMIT}
              onChange={e=>{setShareUrl("");setShareIds(current=>e.target.checked?[...current,id]:current.filter(x=>x!==id));}}/>
              {shopData.get(id)?.name??id}</label>)}
            <button disabled={!shareIds.length} onClick={()=>setShareUrl(`${location.origin}/map/${shortlistHash(shareIds)}`)}>Create snapshot link</button>
            {shareUrl&&<div><label htmlFor="personal-share-url">Share link</label><input id="personal-share-url" value={shareUrl} readOnly onFocus={e=>e.target.select()}/>
              <button onClick={()=>void navigator.clipboard.writeText(shareUrl).then(()=>setNotice("Link copied.")).catch(()=>setError("Copy failed. Select and copy the link above."))}>Copy link</button></div>}
          </aside>}
          {!list.ids.length&&<div className="list-empty"><h3>Leave a little room for discovery.</h3>
            <p>Search for a shop below, or explore the map and save a place you want to visit.</p><a href="/map/">Find your first bowl ↗</a></div>}
          <ul className="personal-shops">{list.ids.map(id=><li key={id}><div><a href={`/map/#${id}`}>{shopData.get(id)?.name??(namesReady?"Unavailable catalog entry":id)}</a>
            <span>{shopData.get(id)?.city??""}</span></div>
            <button disabled={busy} aria-label={`Remove ${shopData.get(id)?.name??"place"} from this list`} onClick={()=>void action(async()=>{
              await api(`/lists/${list.id}/items`,"PUT",{ids:[id],add:false});
            },"Place removed from this list.")}>Remove</button></li>)}</ul>
          <div className="list-add"><label htmlFor="add-shop">Add a soup shop</label>
            {catalogError&&<p role="alert">Shop names could not load. Reload this page to retry; your lists are still stored safely.</p>}
            <input id="add-shop" type="search" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder={namesReady?"Search shops by name or city…":"Loading shop names…"} disabled={!namesReady||busy}/>
            <ul>{candidates.map(shop=><li key={shop.slug}><span>{shop.name}<small>{shop.city}</small></span>
              <button disabled={busy} onClick={()=>void action(async()=>{
                await api(`/lists/${list.id}/items`,"PUT",{ids:[shop.slug],add:true});setSearch("");
              },"Place added to your list.")}>Add</button></li>)}</ul>
            {namesReady&&search.trim().length>=2&&!candidates.length&&<p>No matching shops outside this list. Try a different name or city.</p>}
          </div>
        </> : loaded&&<p>Choose a list to begin.</p>}
      </section>
    </div>
    <p className="account-fine">Account email is used for sign-in. Creating an account does not subscribe you to marketing emails.</p>
  </div>;
}

function AccountRoutes() {
  return <Switch>
    <Route path="/sign-in/*?"><section className="auth-shell"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/><a href="/map/">Just looking? Explore without an account ↗</a></section></Route>
    <Route path="/sign-up/*?"><section className="auth-shell"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/><p>No marketing subscription. Your lists stay private unless you share a snapshot.</p><a href="/map/">Explore without an account ↗</a></section></Route>
    <Route><Portal/></Route>
  </Switch>;
}
class AccountBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  override state = {failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  override render() {
    if(this.state.failed)return <div className="account-error" role="alert">
      Account sign-in could not load. Please reload to retry. <a href="/map/">Explore the public map</a>.
    </div>;
    return this.props.children;
  }
}
export function mountAccount(element:HTMLElement):void {
  if (!clerkPubKey) throw new Error("Account sign-in is not configured.");
  createRoot(element).render(<AccountBoundary><WouterRouter base={basePath}><Provider>
    {element.id==="account-root"?<AccountRoutes/>:<AccountNav/>}
  </Provider></WouterRouter></AccountBoundary>);
}
