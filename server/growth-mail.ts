import type { GrowthStore } from './growth-store.ts';
import { shopBySlug } from '../src/data/shops.ts';
import { CITIES } from '../src/data/cities.ts';
import { isIndexableShop } from '../src/data/indexation.ts';
import { displayName } from '../src/names.ts';

/** Outbox delivery is retryable, with provider idempotency and no caller-controlled links. */
export async function deliverLead(store: GrowthStore, id: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.SOUPMAP_EMAIL_FROM;
  if (!key || !from) return false;
  const result = await store.db.query(`UPDATE growth_leads SET status='sending',delivery_started_at=now(),attempts=attempts+1 WHERE id=$1 AND status IN ('queued','failed') AND attempts<5 RETURNING *`,[id]);
  const lead = result.rows[0];
  if (!lead) return false;
  const shop = shopBySlug.get(lead.shop_slug);
  const city = CITIES.find(c=>c.name===lead.city);
  const path = shop ? (isIndexableShop(shop) ? `/catalog/${shop.slug}/` : `/catalog/?place=${shop.slug}`) : city ? `/city/${city.slug}/` : '/catalog/';
  try {
    const response = await fetcher('https://api.resend.com/emails', {method:'POST', signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`soupmap-lead-${id}`},
      body:JSON.stringify({from,to:[lead.email],subject:shop ? `Your saved soup spot: ${displayName(shop,'en')}` : `Your ${lead.city} soup guide`,
        text:`Your next bowl is waiting.\n\n${shop ? displayName(shop,'en') : `${lead.city} soup guide`}\nhttps://soupmap.com${path}\n\nExplore the map: https://soupmap.com/map/${shop ? '#'+shop.slug : ''}\n\nYou requested this link on Soupmap. This message does not subscribe you to marketing.`})});
    if (!response.ok) throw new Error('Delivery unavailable');
    await store.db.query("UPDATE growth_leads SET status='sent',sent_at=now() WHERE id=$1",[id]);
    return true;
  } catch {
    await store.db.query("UPDATE growth_leads SET status='failed' WHERE id=$1",[id]);
    return false;
  }
}
