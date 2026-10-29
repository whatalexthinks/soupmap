# Soupmap Recipes — writing guide

The recipes live at `/recipes/`. Every `*.md` file in this folder (except this README) is one
recipe, prerendered at build time into a static page. The page adds a servings scaler, a
metric/US toggle, ingredient checkboxes and step timers by reading the format below, so the
format matters as much as the words.

## File format

File name = slug: `shoyu-ramen.md` → `/recipes/shoyu-ramen/`. Lowercase-kebab-case, ASCII only.

```markdown
---
title: Shoyu ramen
dek: A clear chicken-and-dashi broth, a sharp soy tare and springy noodles. Tokyo's classic bowl, made at home over an afternoon.
mark: 醤油ラーメン
region: japan
country: Japan
type: noodle
base:
  - chicken
  - dashi
diet:
  - dairy-free
season:
  - autumn
  - winter
difficulty: medium
serves: 4
active: 60
total: 240
date: 2026-10-20
journal: tokyo-shoyu-chuka-soba
map: /map/?q=shoyu
mapLabel: Find shoyu ramen shops on the map
---

Headnote: two to four short paragraphs. Why this soup is worth making, what makes this version
work, and the one thing people usually get wrong.

## Ingredients

### Broth
- 1.5 kg chicken wings
- 2 l water
- 10 g kombu (about a 10 cm square)

### To serve
- 4 portions fresh ramen noodles (about 130 g each)
- 2 spring onions, thinly sliced
- Salt, to taste

## Method

### Make the broth
1. Put the wings in a large pot, cover with cold water and bring to a boil. Boil for 5 minutes, then drain and rinse off the scum.
2. …

### Finish and serve
3. …

## Tips
- …

## Make ahead and storage
- …

## Variations
- …
```

### Fields

| Field | Required | Values |
|---|---|---|
| `title` | yes | The dish's common name, sentence case: "Shoyu ramen", "Phở bò (Vietnamese beef noodle soup)". |
| `dek` | yes | One or two sentences, ≤ 200 characters. What it is and why it's good. Used as the meta description. |
| `mark` | yes | Correct Japanese, as a Japanese magazine would title the dish: kanji/kana for Japanese dishes (味噌汁, 豚汁), katakana for foreign ones (フォー, ボルシチ, トムヤムクン). 1–10 characters. |
| `region` | yes | One of `japan`, `east-asia`, `southeast-asia`, `south-asia`, `middle-east-africa`, `europe`, `americas`. |
| `country` | yes | Where the dish is from, e.g. `Japan`, `Vietnam`, `Mexico`. |
| `type` | yes | One of `noodle` (noodle soups), `clear` (clear broths and light soups), `hearty` (chunky soups and stews), `creamy` (smooth, puréed or creamy), `chilled` (served cold), `hot-pot` (simmered at the table, nabe, jjigae). |
| `base` | yes | 1–2 of `chicken`, `pork`, `beef`, `lamb`, `seafood`, `dashi`, `vegetable`, `legume`. What the soup is built on. |
| `diet` | no | Any of `vegetarian`, `vegan`, `gluten-free`, `dairy-free`. **Only if the recipe exactly as written qualifies** (see Diet below). |
| `season` | yes | 1–4 of `spring`, `summer`, `autumn`, `winter`. When it's at its best. |
| `difficulty` | yes | `easy` (one pot, no special technique), `medium` (a few components or a technique to watch), `project` (long broth, several components). |
| `serves` | yes | Number of people, 1–12. |
| `active` | yes | Hands-on minutes. Honest. |
| `total` | yes | Minutes from start to bowl, including simmering, soaking and resting (not overnight steps you mention as optional). |
| `prep` | yes | Minutes of preparation: washing, chopping, measuring, mixing a paste, folding dumplings. Not passive soaking or resting. |
| `cook` | yes | Minutes the food is actually on the heat (or in the oven), including unattended simmering. `0` for no-cook soups. `prep + cook` must not exceed `total`; any difference is soaking, resting or chilling. |
| `richness` | yes | Editorial 1–10: how rich and heavy the broth is. 1 = clear and delicate (ushiojiru), 5 = medium body (shoyu ramen), 10 = thick and emulsified (tonkotsu, gumbo with dark roux). |
| `spice` | yes | Editorial 1–10 chilli heat **as written**. 1 = no chilli at all, 3 = a gentle warmth or optional chilli at the table, 6 = clearly spicy, 9–10 = very hot. Judge from the actual chilli quantities. |
| `comfort` | yes | Editorial 1–10: how much of a warming, restorative, "make it on a bad day" bowl it is. Be discerning: not everything is a 9. |
| `date` | yes | `YYYY-MM-DD`. |
| `updated` | no | `YYYY-MM-DD` of the last substantive change (new section, corrected method). Feeds the sitemap `lastmod` and schema.org `dateModified`, so don't bump it for typo fixes. |
| `journal` | no | Slug of a related Soupmap Journal essay (`content/journal/<slug>.md` must exist). |
| `map` | no | `/map/?q=<words>`, only for dishes our Japan shop catalog can show (ramen styles, udon, soba, oden). |
| `mapLabel` | with `map` | Button text. |

### Sections, in this order

1. **Headnote** (paragraphs before the first `##`): 80–220 words.
2. **`## Ingredients`** (required). Optional `### Group` subheadings. Every ingredient is a `- ` bullet.
3. **`## Method`** (required). Optional `### Stage` subheadings. Every step is a numbered `1.` item. Number straight through the whole method (don't restart at 1 in each stage).
4. **`## Restaurant secret`** (required): one paragraph, 30–90 words. The single technique that separates a restaurant-quality bowl from a home one, and *why* it works. It must be true and specific to this dish (not "use good ingredients"). It may expand on a Tip, but say something worth highlighting.
5. **`## Swaps`** (required): exactly three `###` subheadings, in this order, each with 1–3 bullets:
   - `### Gluten-free`: the specific substitutions that make *this recipe* gluten-free (e.g. tamari labelled gluten-free for soy sauce, 100% buckwheat soba, rice noodles), and what changes in the result. If it's already gluten-free as written, say so and name any labels to check. If a gluten-free version isn't really the same dish, say so honestly.
   - `### Plant-based`: how to make it vegan (kombu-shiitake dashi, vegetable stock, tofu, mushrooms…), and what changes. If already vegan, say so.
   - `### High-protein`: realistic additions or swaps that raise protein (an extra egg, more tofu, chicken breast, edamame, a second portion of the main protein…), with rough amounts per bowl.
6. **`## Tips`** (required): 3–6 bullets. The things that make the difference.
7. **`## Make ahead and storage`** (optional): bullets.
8. **`## Variations`** (optional): bullets.

No other `##` sections.

### Ingredient lines (the scaler reads these)

Start each line with the amount, then the unit, then the ingredient, then any preparation:

- `- 500 g pork belly, in one piece`
- `- 1.5 l water` · `- 2 tbsp soy sauce` · `- 1/2 tsp salt` · `- 1 1/2 tbsp mirin`
- `- 2 onions, thinly sliced` (a count: no unit)
- `- 2–3 dried chillies` (ranges use an en dash)
- `- Salt and pepper, to taste` (no amount: not scaled)

Units the scaler understands: `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cm`. Use **grams** for
solids where a cook would reasonably weigh them (meat, bones, noodles, flour, miso, sugar),
**ml/l** for liquids, `tsp`/`tbsp` for small amounts of seasoning. Counts for things you count
(eggs, onions, garlic cloves: `- 4 garlic cloves, crushed`). Put the US-friendly hint in
parentheses only where it really helps: `- 10 g kombu (about a 10 cm square)`.

### Method steps

Each step is 1–4 sentences, one stage of work. Give **times and sensory cues together**: "until
the onions are deep amber and jammy, 35–45 minutes". Write times as numbers with units
(`5 minutes`, `10–12 minutes`, `1 hour`, `2 1/2 hours`): the page turns them into tappable
timers. Name heat levels. Say what "done" looks, smells or sounds like.

Inline `**bold**` and `*italic*` are fine. Links only to `/journal/<slug>/` or `/recipes/<slug>/`.

Swaps are claims people with coeliac disease or allergies will rely on: never call something gluten-free or vegan unless every ingredient in the swap qualifies, and tell people which labels to check.

## What makes a recipe "incredible" here

- **It works the first time.** Proven ratios, honest times, quantities that add up (the broth
  volume must cover the servings; the seasoning must suit that volume).
- **It explains the why** in the headnote and tips: why you blanch the bones, why miso never
  boils, why the onions take 45 minutes.
- **It respects the dish.** Traditional technique first; shortcuts go in Variations, labelled.
- **It's cookable outside the country of origin.** Name a realistic substitute for anything
  hard to find, in Tips or in parentheses.
- **Food safety is right.** Cook poultry through, chill stock quickly, don't keep rice or
  dashi warm for hours, note raw-egg or raw-fish caveats.

## Voice

Warm, clear and confident, like a friend who cooks well. "I" is fine for opinions ("I think
the char on the onion is the whole point"), "you" for instructions.

- **Never invent experiences, people or quotes.** No "my grandmother", no "when I lived in
  Hanoi", no "a chef told me". The byline is "Soupmap Kitchen".
- Explain every non-English term once: *kombu* (dried kelp), *tare* (the seasoning concentrate).
- No prices, no brand recommendations, no health claims.

## Facts

- Origin notes must be well documented; legends are hedged ("is often said to").
- Don't copy any recipe or text. Write every recipe in your own words from technique you know.

## Diet

- `vegetarian`: no meat, poultry, fish or seafood, and no stock, dashi (katsuobushi is fish),
  fish sauce, shrimp paste, gelatin or animal fat made from them. Eggs and dairy are fine.
- `vegan`: vegetarian and also no eggs, dairy or honey.
- `gluten-free`: no wheat, barley, rye or regular soy sauce (it contains wheat). Tamari
  labelled gluten-free is fine if the recipe says so. Ramen, udon and most soba contain wheat.
- `dairy-free`: no milk, butter, cream, cheese or yoghurt.

## Photos

Leave out any `photo` field. Photos are added separately, only with a verified free licence and
attribution (see `scripts/fetch-recipe-photos.ts`).
