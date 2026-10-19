/** Public navigation remains usable without JavaScript or an auth session. */
export function siteNavigationHtml(): string {
  return `<details class="site-menu"><summary>Menu</summary><nav aria-label="Site navigation">
    <a href="/">Home</a><a href="/map/">Explore map</a>
    <a href="/catalog/">Shop directory</a><a href="/journal/">Journal</a>
    <a href="/account">My lists</a><a href="/account/settings">Account settings</a>
    <a href="/sign-in">Sign in</a>
  </nav></details>`;
}
