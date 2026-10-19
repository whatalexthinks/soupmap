/** The same identity and destinations on every page, rendered before JavaScript. */
export type SiteSection = 'home' | 'discover' | 'map' | 'me' | 'journal' | 'recipes' | 'account' | 'info';
const destinations = [
  ['discover', '/catalog/', 'Discover'],
  ['map', '/map/', 'Map'],
  ['me', '/me/', 'Your Soupmap'],
  ['journal', '/journal/', 'Journal'],
  ['recipes', '/recipes/', 'Recipes'],
] as const;
export function brandHtml(): string {
  return '<a class="site-brand" href="/" aria-label="Soupmap home"><img class="site-brand-mark" src="/brand-mark-black.png" width="31" height="32" alt=""/><span>soupmap<span class="site-brand__dot">.</span></span></a>';
}
export function siteHeader(section: SiteSection, accountId?: 'home-account' | 'directory-account' | 'map-account'): string {
  return `<header class="site-header${section === 'map' ? ' site-header--map' : ''}">
    <div class="site-header__inner">${brandHtml()}
      <span class="site-edition">A WORLD OF SOUPS<span>Japan / chapter one</span></span>
      <nav class="site-nav" aria-label="Main navigation">${destinations.map(([id, href, label]) =>
        `<a href="${href}"${section === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <span class="site-account"${accountId ? ` id="${accountId}"` : ''}><a href="/account"${section === 'account' ? ' aria-current="page"' : ''}>Account</a></span>
    </div>
  </header>`;
}

/** Used by both Vite's static-page transform and document-level integration tests. */
export function renderSiteShell(html: string): string {
  return html.replace(/<!--soupmap:header:(\w+)-->/g, (_, section: SiteSection) =>
    siteHeader(section, section === 'home' ? 'home-account' : section === 'map' ? 'map-account' : undefined))
    .replaceAll('<!--soupmap:brand-->', brandHtml());
}
