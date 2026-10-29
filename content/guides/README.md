# Writing a city guide introduction

Each file here adds an editorial introduction to one generated city guide. The file name is
the guide's URL slug: `content/guides/miso-ramen-in-sapporo.md` → `/guides/miso-ramen-in-sapporo/`.
The list of places comes from the catalog; the introduction is what a visitor needs before
going there.

```markdown
---
dek: One sentence, 60–200 characters, that says what makes this city's bowl itself.
updated: 2026-10-29
---
Two or three paragraphs, 120–260 words in all.

## Know before you go
- Up to four short, practical bullets.
```

## What to write

- **What's local.** The city's own style, where it came from, how it differs from the bowl
  next door. If there is no single local style, say so and describe the scene honestly.
- **Where bowls cluster.** Districts, stations, markets or streets known for them.
- **How it works.** Ordering, ticket machines, noodle firmness, refills, condiments, hours
  that differ from the norm.
- **Links** to our own recipes (`/recipes/<slug>/`), journal essays (`/journal/<slug>/`) and
  other guides (`/guides/<slug>/`). The build fails on a link to a page that doesn't exist.

## Rules

- **Facts only, in our own words.** History and well-documented facts that a reader could
  check. When a story is a claim ("often credited as the birthplace"), say so.
- **No invented experiences.** No "we queued for an hour", no tasting notes for a specific
  shop unless someone on the team ate there and says so.
- **No rankings.** Guides list places; they don't rank them. Avoid "best", "top rated" and
  "must-try" (the parser rejects them). Name a shop only when it is part of the city's
  documented history (the founder of a style, a decades-old institution), never as a pick.
- **No prices or opening hours.** They change; the shop records hold what we know.
- **Keep it current.** Bump `updated` when the facts change, not for typo fixes.
