const path = window.location.pathname.replace(/\/+$/, "") || "/";
const legacySharedLink = path === "/" && !!window.location.hash && window.location.hash !== "#how-it-works"
  && !document.getElementById(window.location.hash.slice(1));

const legacyCollection = path === '/' && ['hub', 'collection'].some(key => new URLSearchParams(location.search).has(key));
if (legacySharedLink || legacyCollection) {
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

const heroWords = document.querySelectorAll<HTMLElement>(".home-hero__word > span");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
if (heroWords.length === 3 && !reduceMotion.matches) {
  const sequence = [1, 2, 0];
  let step = 0;
  const rotateOnce = () => {
    const current = document.querySelector<HTMLElement>(".home-hero__word > span.is-current");
    current?.classList.remove("is-current");
    const index = sequence[step];
    if (index === undefined) return;
    heroWords[index]?.classList.add("is-current");
    step += 1;
    if (step < sequence.length) window.setTimeout(rotateOnce, 1050);
  };
  window.setTimeout(rotateOnce, 650);
}

// Keep the homepage lightweight; the nationwide catalog and WebGL load only on the map.
void import('./ui/home-cities.ts').then(({ mountHomeCities }) => mountHomeCities())
  .catch(() => { /* The server-rendered directory links still work. */ });
