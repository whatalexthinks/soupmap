import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { HOME_CITIES, homeCitiesHtml, homeCityHtml } from '../src/render/home.ts';
import { mountHomeCities } from '../src/ui/home-cities.ts';
import shops from '../src/data/shops.json' with { type: 'json' };

function setup() {
  const window = new Window({ url: 'https://soupmap.example/' });
  window.document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    .replace('<!--soupmap:home-cities-->', homeCitiesHtml())
    .replace('<!--soupmap:home-featured-->', homeCityHtml()));
  return window;
}

test('homepage works without JavaScript: open map, join, directories, and real shop links', async () => {
  const window = setup();
  try {
    assert.ok(window.document.querySelector('.home-hero a[href="/map/"]'));
    assert.ok(window.document.querySelector('a[href="/sign-up"]'));
    const links = window.document.querySelectorAll<HTMLAnchorElement>('[data-home-city]');
    assert.equal(links.length, HOME_CITIES.length);
    for (const city of HOME_CITIES) {
      assert.ok([...links].some(link => link.getAttribute('href') === `/city/${city.slug}/`));
      window.document.querySelector('#home-city-browser')!.innerHTML = homeCityHtml(city.slug);
      const places = window.document.querySelectorAll<HTMLAnchorElement>('.city-places li a');
      assert.ok(places.length > 0);
      for (const place of places) {
        assert.equal(new URL(place.href).pathname, '/map/');
        assert.ok(shops.some(shop => shop.slug === new URL(place.href).hash.slice(1) && shop.city === city.name));
      }
    }
  } finally { await window.happyDOM.close(); }
});

test('changing city updates only the preview and announces the selection, preserving keyboard focus', async () => {
  const window = setup();
  try {
    const document = window.document as unknown as Document;
    mountHomeCities(document);
    mountHomeCities(document);
    for (const city of HOME_CITIES) {
      const link = window.document.querySelector<HTMLAnchorElement>(`[data-home-city="${city.slug}"]`)!;
      link.focus();
      const click = new window.MouseEvent('click', {bubbles:true,cancelable:true,button:0});
      link.dispatchEvent(click);
      assert.equal(click.defaultPrevented, true);
      assert.equal(window.document.activeElement, link);
      assert.equal(window.document.querySelectorAll('.city-index [aria-current=true]').length, 1);
      assert.equal(link.getAttribute('aria-current'), 'true');
      assert.ok(window.document.querySelector('#city-name')!.textContent.includes(city.name));
      assert.equal(window.document.querySelector('#home-city-status')!.textContent, `Showing featured places in ${city.name}.`);
    }
  } finally { await window.happyDOM.close(); }
});

test('city links retain modified-click navigation and tolerate unknown city data', async () => {
  const window = setup();
  try {
    mountHomeCities(window.document as unknown as Document);
    const link = window.document.querySelector<HTMLAnchorElement>('[data-home-city="kyoto"]')!;
    for (const modifiers of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {altKey:true}, {button:1}]) {
      const event = new window.MouseEvent('click', {bubbles:true,cancelable:true,...modifiers});
      link.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false);
      assert.ok(window.document.querySelector('#city-name')!.textContent.includes('Tokyo'));
    }
    link.dataset.homeCity = 'missing';
    const event = new window.MouseEvent('click', {bubbles:true,cancelable:true});
    link.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.ok(homeCityHtml('missing').includes('Tokyo'));
  } finally { await window.happyDOM.close(); }
});
