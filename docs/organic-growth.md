# Organic growth: launch and measurement checklist

## Ready in this release

- Three connected Tokyo planning articles: `/journal/tokyo-soup-guide/`,
  `/journal/tokyo-soup-day-plan/`, `/journal/tokyo-ramen-dietary-questions/`.
- Ordinary HTML links from the homepage, Journal, national directory and Tokyo directory.
- Eight existing profiles with dated source research, practical notes and relevant Journal links.
  Source research is not firsthand verification, a ranking, or a dietary certification.
- Honke Owariya's operator-reported restaurant suspension is visible, not hidden as a generic unknown.
- Personal dashboard excluded from the sitemap and marked noindex; public catalog pagination remains crawlable.
- `npm run seo:check` validates the built sitemap and all its HTML documents after `npm run build`.

## After publishing

1. Open `/robots.txt` and `/sitemap.xml` on the published domain. Check that new guide URLs return
   real article HTML, self-canonical links and successful responses.
2. In Google Search Console, finish ownership verification if still needed. The verification
   file is already in the project. Submit the canonical `/sitemap.xml` once; do not repeatedly
   resubmit in an attempt to force rankings.
3. Inspect the three new guide URLs with URL Inspection. Request indexing where appropriate.
   A successful live test or an indexing request does not guarantee indexing.
4. Export Search results → Queries and Pages, with clicks, impressions, CTR and position, plus
   the Page indexing report. Compare equivalent periods. Separate branded from non-branded
   queries and examine relevant countries/devices; don't call bot requests new readers.
5. Keep a simple monthly record: non-branded clicks, useful landing pages indexed,
   search-to-map activity and account saves. Existing map/save analytics measure product
   actions, not proof that a particular search query converted. Never send private lists,
   raw searches, email addresses or precise visitor locations as event payloads.

## Distribution worth doing manually

Share the useful guide, not a generic request for a backlink. Approach Tokyo travel newsletters,
small hotel/hostel guest-resource editors, and independent food writers whose readers need
practical planning information. Read their submission rules first. No purchased links,
bulk unsolicited messages or fabricated personal endorsements.

Suggested individual introduction:

> We made a free Tokyo soup planning guide that distinguishes sourced restaurant information
> from unverified map listings. It links to operator information and includes a separate
> dietary-question checklist. If it would help your readers, you're welcome to reference it.
> We'd also appreciate corrections or suggestions for details travelers regularly struggle with.

Personalize this to the recipient and link the relevant guide. No outreach has been sent by
the app or agent. Do not claim the restaurants were personally visited.

## Next editorial work

Use Search Console evidence to choose the next guide or profile. Prefer improving a page that
answers a real traveler question over generating near-duplicate neighborhood pages. Seek original
photos with permission, actual branch visits and specific corrections. Do not label a dish
vegetarian, halal, gluten-free or allergy-safe from a cuisine tag or a photograph.

No change in this release guarantees traffic, rankings or indexing. Search Console access and
external distribution are owner actions, not completed merely by shipping code.
