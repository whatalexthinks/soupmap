/** Entry for /me/: load the catalog and the visitor's data, then render the dashboard. */
import journal from "virtual:soupmap-journal";
import { loadJapaneseFont } from "../fonts.ts";

const root = document.querySelector<HTMLElement>("#me-root")!;

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

async function start(): Promise<void> {
  loadJapaneseFont();
  // Imported here, not at the top, so a failed catalog download shows a message instead of a stuck page.
  const [{ SHOPS, shopBySlug }, { restoreNameLanguage }, { Dashboard }, { UserData }] = await Promise.all([
    import("../data/shops.ts"), import("../names.ts"), import("./view.ts"), import("./store.ts"),
  ]);
  restoreNameLanguage();
  const data = new UserData(new Set(shopBySlug.keys()), storage());
  await data.refreshAccount();
  const dashboard = new Dashboard(root, { shops: SHOPS, bySlug: shopBySlug, data, journal });
  dashboard.render();
  root.removeAttribute("aria-busy");
  // Another tab (usually the map) saved or stamped something: pick it up.
  window.addEventListener("storage", event => {
    if (!event.key?.startsWith("soupmap:")) return;
    data.reload();
    dashboard.render();
  });
  // Saves made on the map while signed in go to the account, not storage: refresh on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !data.signedIn) return;
    void data.refreshAccount().then(() => dashboard.render());
  });
  if (location.hash) dashboard.openView(location.hash,false,true);
}

start().catch(() => {
  root.removeAttribute("aria-busy");
  const status = root.querySelector(".me-loading");
  if (status) status.innerHTML = 'Your Soupmap couldn\'t load. Please reload, or <a href="/map/">open the map</a>.';
});
