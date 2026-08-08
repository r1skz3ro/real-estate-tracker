# server/scraping/parsers

One `Parser` per portal: `(html, pageUrl) => { listings, emptyState }`. Pure — no DB, no network.

## Belongs here

The five parsers, `util.ts` (shared types and pl-PL number/URL/ld+json helpers), `index.ts` (the
`Portal → Parser` map), and `__fixtures__/` (real captured pages).

## Doesn't belong here

Fetching, diffing, persistence.

## Gotchas

- **Anchor on embedded data, never CSS classes.** `__NEXT_DATA__`, ld+json or `data-*` attributes.
  Portals churn class names constantly; they churn their data layer rarely.
- **`emptyState` must come from a real "the portal said zero" signal** — never from
  `listings.length === 0`. Deriving it would make a broken parser look like a quiet week, and a
  quiet week is normal: a link only counts as failed when it parses 0 listings **and** the page
  carries no empty-state marker.
- Every portal pads its results with non-matching offers (recommendations, wider radius). Filtering
  those out is the parser's job.
- **Do not touch `__fixtures__/`.** The tests match them byte-for-byte, and they are
  prettier-ignored for that reason. This suite is the only code in the project that rots silently
  when a portal changes its HTML — when it breaks, re-capture the page, don't loosen the test.
