const path = window.location.pathname.replace(/\/+$/, "") || "/";
const legacySharedLink = path === "/" && !!window.location.hash && window.location.hash !== "#how-it-works"
  && !document.getElementById(window.location.hash.slice(1));

if (legacySharedLink) {
  window.location.replace(`/map/${window.location.search}${window.location.hash}`);
}

const accountMount = document.querySelector<HTMLElement>("#home-account");
if (accountMount && path === "/") {
  import("./account.tsx")
    .then((module: { mountAccount?: (element: HTMLElement) => void | Promise<void> }) => {
      if (typeof module.mountAccount === "function") {
        return module.mountAccount(accountMount);
      }
    })
    .catch(() => {
      // Public map discovery and the static auth links remain available if auth is offline.
    });
}

// Keep the homepage lightweight; the nationwide catalog and WebGL load only on the map.
void import('./ui/home-cities.ts').then(({ mountHomeCities }) => mountHomeCities())
  .catch(() => { /* The server-rendered directory links still work. */ });
