# The Soup Journal — writing guide

The journal lives at `/journal/`. Every `*.md` file in this folder (except this README) is one
article, prerendered at build time into a static page. Nothing here needs JavaScript to read.

## File format

File name = slug: `sapporo-miso-ramen.md` → `/journal/sapporo-miso-ramen/`.
Slugs are lowercase-kebab-case, ASCII only.

```markdown
---
title: Sapporo miso: the bowl built for snow
dek: One sentence that makes someone want to read the piece (under 180 characters).
category: ramen
mark: 味噌
date: 2026-10-18
map: /?q=sapporo
mapLabel: Find Sapporo-style shops on the map
glance:
  - Where: Sapporo, Hokkaido
  - Broth: pork or chicken stock seasoned with miso
  - Noodles: thick, curly, yellow
further:
  - Ramen
  - Miso
related:
  - hakata-tonkotsu
---

Opening paragraph…

## A section heading

Body…
```

Fields:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Sentence case. May contain a colon. |
| `dek` | yes | One sentence, ≤ 180 characters. Used as the meta description. |
| `category` | yes | One of the ids below. |
| `mark` | yes | Shown as a large vertical mark: kanji for Japanese topics (味噌, 蕎麦), katakana for foreign dishes as Japanese magazines write them (フォー, ボルシチ). Must be correct Japanese. 1–4 characters is ideal; up to 8 are allowed and longer marks are set smaller. |
| `date` | yes | `YYYY-MM-DD`, the publication date. |
| `map` | no | A link into the map: `/map/?q=<search words>` (the short form `/?q=` also works) or `/city/<sapporo\|kitakata\|tokyo\|kyoto\|osaka\|wakayama\|fukuoka>/`. Only for topics our Japan catalog can actually show. |
| `mapLabel` | with `map` | Button text, e.g. "Find tsukemen shops on the map". |
| `glance` | yes | 3–5 short "Label: fact" lines for the *At a glance* box. Facts only. |
| `further` | yes | 2–4 Wikipedia article titles for further reading (rendered as Wikipedia links). Use titles you are confident exist, in English, e.g. `Ramen`, `Dashi`, `Pho`. |
| `related` | no | Up to 3 other journal slugs. |

### Categories

| id | Name | Mark |
|---|---|---|
| `ramen` | Ramen Styles | 拉麺 |
| `noodles` | Noodles | 麺 |
| `japanese-soups` | Japanese Soups | 汁物 |
| `craft` | Craft & Ingredients | 素材 |
| `history` | History & Culture | 歴史 |
| `travel` | Travel & Etiquette | 旅 |
| `world` | Soups of the World | 世界 |

### Markdown we support

`## Heading`, `### Subheading`, paragraphs, `- bullet` and `1. numbered` lists, `> pull quote`
(one paragraph), `**bold**`, `*italic*`, and links `[text](url)`. Internal links use
`/journal/<slug>/`, the map (`/map/?q=…`, `/city/<slug>/`) or `/catalog/`. No HTML, images,
tables or footnotes. Japanese text can be written inline (味噌, とんこつ); it is tagged for the
right font automatically. Give the romanized word first and the Japanese in parentheses on
first use: *kaedama* (替え玉).

## Voice

Personal, warm and curious, like a well-travelled friend's blog: sensory detail, an opinion or
two, a little wit, short paragraphs. Write for an English-speaking traveller who loves food but
isn't an expert. Explain every Japanese term once.

- Use "I" for opinions and reflections ("I think the first sip tells you everything"), and "you"
  to put the reader at the counter.
- **Never invent experiences, people or quotes.** No "last spring I ate at…", no named friends,
  no chef said. The byline is "Soupmap Journal", not a persona.
- Open with a hook, not a definition. End with a thought worth keeping, not a summary.
- 700–1,100 words. 3–5 `##` sections. A practical "how to eat it / what to order" section where
  it fits.

## Facts

These pages must be **true**. Readers and search engines will trust them.

- Only state facts that are well documented and widely agreed. If unsure, leave it out.
- Origin stories are often legends: say "is often credited with", "the story goes",
  "according to local lore". Never present a legend as fact.
- No prices, opening hours, or claims that a specific shop is open today.
- Name individual restaurants only for well-documented history (e.g. Rairaiken in Asakusa,
  Yoshimuraya in Yokohama, Taishoken, Shikairo in Nagasaki, Nissin) — never as a
  recommendation, and never with invented details.
- Avoid precise statistics (counts, rankings, "most in Japan") unless you are certain.
- Don't copy text from anywhere. Write everything in your own words.
