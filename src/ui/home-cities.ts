import { HOME_CITIES, homeCityHtml } from '../render/home.ts';

/** Progressive enhancement: a failed script still leaves seven useful directory links. */
export function mountHomeCities(root: Document = document): void {
  const navigation = root.querySelector<HTMLElement>('.city-index');
  const browser = root.querySelector<HTMLElement>('#home-city-browser');
  if (!navigation || !browser || navigation.dataset.enhanced) return;
  navigation.dataset.enhanced = 'true';
  navigation.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-home-city]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const city = HOME_CITIES.find(item => item.slug === link.dataset.homeCity);
    if (!city) return;
    event.preventDefault();
    navigation.querySelector('[aria-current]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'true');
    browser.innerHTML = homeCityHtml(city.slug);
    const status = root.querySelector('#home-city-status');
    if (status) status.textContent = `Showing featured places in ${city.name}.`;
  });
}
