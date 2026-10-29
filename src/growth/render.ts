import type { Shop } from '../data/schema.ts';
import { esc } from '../ui/dom.ts';
import { displayName } from '../names.ts';
import { AFFILIATES, commerceFor, isFeatured, trackedUrl } from './config.ts';
import { cuisineOf } from '../cuisines.ts';
import { cityByName } from '../data/cities.ts';

export function passportWidget(city = 'Tokyo', slug = ''): string {
  return `<section class="growth-passport" data-passport-city="${esc(city)}" data-passport-shop="${esc(slug)}"><div><span class="directory-kicker">Winter soup passport</span><h2>Five bowls. A new side of ${esc(city)}.</h2><p data-passport-count>0/5 bowls tried in ${esc(city)}</p><progress max="5" value="0" aria-label="Bowls tried"></progress></div><div><button class="directory-button" type="button" data-passport-start>${slug ? 'Check in / Mark as tried' : 'Start your soup passport'} →</button><p class="growth-fine" data-passport-status role="status">Sign in to keep your stamps across devices. Visits are self-reported.</p></div></section>`;
}
export function mapBanner(shop?: Shop, city = 'Japan'): string {
  const hub = cityByName.get(city);
  const href = shop ? `/map/#${shop.slug}` : hub ? `/map/?city=${hub.slug}` : '/map/';
  return `<aside class="growth-map-banner"><svg viewBox="0 0 120 72" width="120" height="72" aria-hidden="true"><path d="M0 18H120M0 54H120M28 0V72M90 0V72M0 72L120 0" fill="none" stroke="currentColor" stroke-width="1" opacity=".2"/><path d="M60 12a15 15 0 0 1 15 15c0 12-15 29-15 29S45 39 45 27a15 15 0 0 1 15-15" fill="currentColor"/><circle cx="60" cy="27" r="5" fill="#f8f0e2"/></svg><div><span class="directory-kicker">Your next bowl, on the map</span><strong>${esc(shop ? displayName(shop, 'en') : `Explore ${city} by the bowl`)}</strong>${shop ? `<small>${shop.lat.toFixed(4)}° N · ${shop.lng.toFixed(4)}° E · Location preview</small>` : ''}</div><a class="directory-button" href="${esc(href)}">Explore on Interactive SoupMap →</a></aside>`;
}
export function weatherWidget(shop: Pick<Shop, 'lat' | 'lng' | 'city'>): string {
  return `<section class="growth-weather" data-weather-lat="${shop.lat}" data-weather-lng="${shop.lng}" data-weather-city="${esc(shop.city)}"><span aria-hidden="true">◌</span><div><strong data-weather-copy>Current soup forecast in ${esc(shop.city)}</strong><p data-weather-detail>Checking the conditions for your next bowl.</p><small>Weather: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · Soup score is our playful comfort index.</small></div><button type="button" data-weather-retry hidden>Retry</button></section>`;
}
export function leadCapture(shop?: Shop, city = 'Japan'): string {
  return `<section class="growth-lead"><div><span class="directory-kicker">Keep a little discovery</span><h2>${shop ? 'Save this bowl for later.' : `Your next soup trip starts in ${esc(city)}.`}</h2><p>${shop ? 'Email yourself this spot. No password, no account needed.' : 'Get a link to this city’s soup guide in your inbox.'}</p></div><form data-growth-form="lead" class="growth-form"><input type="hidden" name="shop" value="${esc(shop?.slug ?? '')}"><input type="hidden" name="city" value="${esc(shop?.city ?? city)}"><label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label><label class="growth-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label class="growth-consent"><input type="checkbox" name="marketing"> Also send me occasional Soupmap discoveries.</label><button class="directory-button" type="submit">${shop ? 'Email me this soup spot' : 'Email me the city guide'} →</button><p class="growth-fine">One requested email. Marketing is optional. <a href="/privacy/">Privacy</a></p><p data-form-status role="status"></p></form></section>`;
}
export function outboundActions(shop: Shop): string {
  const c = commerceFor(shop.slug);
  const links = [['Order online', c?.orderUrl], ['Reserve a table', c?.reserveUrl]].flatMap(([label, value]) => {
    const url = value ? trackedUrl(value) : null;
    return url ? [`<a class="directory-button" href="${esc(url)}" target="_blank" rel="sponsored noopener">${label} ↗</a>`] : [];
  });
  return `<section class="growth-order" aria-label="Order or reserve"><span class="directory-kicker">Order or reserve</span>${links.length ? links.join('') + '<small>Partner links · we may earn a commission.</small>' : shop.website ? `<a class="directory-text-link" href="${esc(trackedUrl(shop.website) ?? shop.website)}" target="_blank" rel="noopener">Check the restaurant’s website ↗</a><small>Delivery and reservations are not confirmed.</small>` : '<p>Order and reservation links have not been confirmed. Check live restaurant details before visiting.</p>'}</section>`;
}
export function ownerCallout(shop: Shop): string {
  const c = commerceFor(shop.slug);
  return `<section class="growth-owner"><span class="directory-kicker">For the people behind the bowl</span><h2>${c?.verifiedOwner ? 'A restaurant with a claimed profile.' : 'Is this your restaurant?'}</h2><p>Claim your free Soupmap profile, keep your details current, and help your next regular find you.</p><a class="directory-button directory-button--quiet" href="/claim/?shop=${encodeURIComponent(shop.slug)}">Claim your verified SoupMap profile →</a><small>Ownership is checked before a verified badge is granted. Featured placements are labeled sponsored.</small></section>`;
}
export function commerceLabels(shop: Shop): string {
  const c = commerceFor(shop.slug);
  const rating = c?.rating;
  return `${c?.verifiedOwner ? '<span class="growth-verified">✓ Owner verified</span>' : ''}${isFeatured(shop.slug) ? '<span class="growth-gold">Featured · Sponsored</span>' : ''}${rating ? `<p class="growth-rating">${rating.value}/5 from ${rating.count} ratings · <a href="${esc(rating.source)}">Rating source</a> · checked ${esc(rating.checkedAt)}</p>` : ''}`;
}
export function affiliateModule(cuisine = 'all'): string {
  const offers = AFFILIATES.filter(a => cuisine === 'all' || a.cuisines.includes(cuisine));
  return `<section class="growth-home"><div><span class="directory-kicker">A bowl closer to home</span><h2>Craving this at home?</h2><p>Start with a good broth. Finish it your way.</p></div>${offers.length ? `<div class="growth-products">${offers.flatMap(a => {const url = trackedUrl(a.url); return url ? [`<a href="${esc(url)}" target="_blank" rel="sponsored noopener"><strong>${esc(a.title)}</strong><span>${esc(a.description)}</span>Shop broth &amp; kits ↗</a>`] : [];}).join('')}</div><small>Affiliate links. Soupmap may earn a commission.</small>` : '<a class="directory-button directory-button--quiet" href="/recipes/">Find a soup to make tonight →</a>'}</section>`;
}
export function shopGrowth(shop: Shop): string {
  return `${commerceLabels(shop)}${outboundActions(shop)}${leadCapture(shop)}${passportWidget(shop.city, shop.slug)}${affiliateModule(cuisineOf(shop))}${ownerCallout(shop)}`;
}
