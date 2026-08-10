# Portals

Everything portal-specific that was established by hand against the live sites. When a scrape breaks
in eight months, start here rather than re-deriving it.

Code: `src/server/scraping/portals.ts` (identity, `ready` selector, expired markers, pagination),
`src/server/scraping/parsers/*.ts` (extraction), `src/server/scraping/parsers/__fixtures__/` (saved
HTML the parser tests match byte-for-byte).

## Summary

| Portal                  | Fetch       | Extraction path                                                                                   | Empty state                           | Pagination          |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------- |
| otodom.pl               | HTTP        | `<script id="__NEXT_DATA__">` → `props.pageProps.data.searchAds.items`                            | `items: []`                           | `?page=N`           |
| nieruchomosci-online.pl | HTTP        | ld+json `CollectionPage` → `mainEntity.offers[0].offers`                                          | ld+json present, `offers: []`         | `&p=N` appended raw |
| gratka.pl               | HTTP        | ld+json `Product` → `offers.offers`                                                               | ld+json present, `offers: []`         | `?page=N`           |
| adresowo.pl             | HTTP        | `#offer-list-results a[data-track="offer-link"]` → `/o/<slug>`                                    | results grid present but empty        | `_lN` path token    |
| olx.pl                  | **browser** | first `[data-testid="listing-grid"]` → `[data-cy="l-card"]` → `a[href*="/oferta/"]` → `-ID<code>` | `[data-testid="total-count"]` reads 0 | `?page=N`           |

Browser `ready` selectors (what the Playwright path waits for before reading the DOM) are in
`PORTALS` in `src/server/scraping/portals.ts`.

## Listing dates (`listings.postedAt`)

The date the portal prints on the card. **The five do not agree on what that date means**, and two
publish none at all — so `postedAt` is nullable, the UI shows `—` where it is missing, and
`firstSeenAt` (when this tracker first saw the offer) is the timestamp that always exists.

| Portal                  | Source                                                                    | Actually means    |
| ----------------------- | ------------------------------------------------------------------------- | ----------------- |
| otodom.pl               | `dateCreated` in `__NEXT_DATA__` (also kept in `details`)                 | created           |
| olx.pl                  | tail of `[data-testid="location-date"]`, after the last `-`               | posted, or bumped |
| nieruchomosci-online.pl | `"modDate"` in the tile blob, paired to the id via that tile's `shareUrl` | last modified     |
| gratka.pl               | none found on the search page                                             | —                 |
| adresowo.pl             | none found on the search page                                             | —                 |

All three go through `parsePostedAt()` in `parsers/util.ts`, which reads otodom's
`YYYY-MM-DD HH:MM:SS`, Polish long dates (`5 sierpnia 2026`), the `Odświeżono dnia` prefix OLX puts
on a bumped offer, and `Dzisiaj`/`Wczoraj o HH:MM`.

Two placeholders must keep returning `null`, and both are in the fixtures: otodom writes
`1999-02-29` — a day that does not exist, which JS silently rolls forward to 1 March — and
nieruchomosci-online writes `-0001-11-30`. Anything before the year 2000 is rejected for that
reason, against the _source string_, not the parsed `Date`.

nieruchomosci-online is the fragile one: its dates live in JSON escaped inside a script string, not
in parseable markup, so the pairing is textual (`modDate` … ≤800 chars … `shareUrl`). The fixture
holds exactly one `shareUrl` per `modDate`, 438–547 chars apart. Coverage against the current
fixtures is otodom 18/19 (the miss is the placeholder), nieruchomosci-online 40/40, olx 25/25 — the
parser test pins ≥80%, so a renamed key fails loudly instead of writing nulls forever.

## Expired-listing markers

Used by `verifyRemoved()` to confirm a removal candidate against its own detail page. Deliberately
one-sided — anything unrecognised leaves the listing live and retries next run, so a marker we have
not recorded yet _delays_ a removal rather than inventing one.

| Portal               | Marker                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- |
| nieruchomosci-online | `<title>Strona błędu 404` — soft 404: HTTP 200 with an error page in the body          |
| otodom               | `"shouldShowExpiredAdPage": true` (live ads have `null` alongside `"status":"active"`) |
| gratka               | real HTTP 404                                                                          |
| adresowo, olx        | none recorded yet — they ride the HTTP status plus the shared wording fallback         |

Shared fallback regex (`EXPIRED_FALLBACK` in `src/server/scraping/fetch/index.ts`): anchored on "Ogłoszenie",
because a bare `zakończone`/`archiwalne` also occurs inside live listing descriptions and a false
positive here is exactly the phantom "sold!" the removal rules exist to prevent. A redirect to the
site root also counts as gone.

## Per-portal notes

### olx.pl — the only one that needs a browser

Verified 403 from CloudFront on every plain-HTTP variant tried: realistic Chrome headers, HTTP/2,
and OLX's own `/api/v1/offers` JSON endpoint. It needs a real browser, full stop.

It pads results twice over:

1. **A second `listing-grid`** holding ~40 filler cards (wider radius / last resort). Only the
   **first** grid is the search — its card count matches OLX's own "Znaleźliśmy N ogłoszeń", and on
   a zero-result page the first grid is empty while the padding grid is still full. This is why
   `emptyState` reads `total-count`, and why the parser takes `.first()`.
2. **`reason=extended_search…`** query params on individual filler cards, an older mechanism that
   can appear inside the results grid. Filtered separately.

OLX and Otodom share an owner, so an OLX search **interleaves genuine Otodom offers among its own** —
15 of the 25 results in the fixture. Same OLX card markup, but `/pl/oferta/` paths on `otodom.pl`.
They are real results of the search and are kept, so **an OLX link legitimately yields otodom.pl
listing URLs**. `fetchPage()` and `verifyRemoved()` key off `detectPortal(listing.url)`, so those
resolve against Otodom's ready selector and expired marker with no special-casing.

External id: `-ID<code>` anchored at the _end_ of the path (a slug may contain that sequence itself),
with an optional `.html` suffix — OLX's own ads carry it, Otodom cross-posts end at the id.

### otodom.pl

The richest source: `__NEXT_DATA__` carries price, area, price/m², rooms, floor, plot area, creation
date, private-vs-agency and full-size image URLs. `shortDescription` is truncated to ~200 chars on
the search page; the full text lives on the detail page and is not worth a request per listing.

### gratka.pl

Parse the ld+json `Product` block, **not** the `[data-property-id]` cards: an empty search still
renders six "you might like" cards. The ld+json lists exactly the search results, in page order.
Price/m² is not published and is derived from price ÷ area. External id: `/ob/<digits>` or
`/oi/<digits>`.

### adresowo.pl

Scraped from the DOM because there is no structured data. Scoped to `#offer-list-results` — below
that grid the page appends an "Oferty z najbliższej okolicy" block whose offers are not results of
this search.

Adresowo publishes **no "no results" wording** — it silently widens the search instead — so the
honest empty-state signal is the results grid rendering empty. That is the one place a
`length === 0` check is legitimate, and it is gated on the grid existing at all.

Prices and areas are read from whole `<p>` blocks matching `^([\d\s,]+)\s*(zł|m²|ha)$`; matching a
mere suffix would let a description ending in "zł" overwrite the price with null. `ha` values are
multiplied by 10 000.

Pagination hides the page inside the filter token: `g5_lod` → `g5_l2od` → `g5_l3od`, and with no
filters at all `/dzialki/wroclaw/` → `/dzialki/wroclaw/_l2`.

### nieruchomosci-online.pl

ld+json `CollectionPage` → `mainEntity.offers[0].offers`. Publishes price/m² directly in
`priceSpecification`, plus a description and `addressRegion`. External id: the trailing digits of
`<slug>-<digits>.html`.

Its query string is **positional**, e.g. `?3,dzialka,sprzedaz,,Sulistrowiczki:44767,…` — running it
through `URLSearchParams` re-encodes it into `?3%2Cdzialka%2C…=&p=2` and breaks the search, so page 2
is built by appending the raw `&p=N` string.

## Fetch-layer behaviour that touches all five

- `fetchPage()` starts on the portal's default mode and **escalates HTTP → browser once** when a
  block is detected, persisting that escalation onto the link so later runs skip the wasted attempt.
- Block detection: status 403/429/503, or a challenge marker (`Request blocked`, `captcha`,
  `cf-browser-verification`, `DataDome`) in a body under 20 KB. The size gate matters — real search
  pages ship recaptcha keys, so the marker alone false-positives on three of the five portals.
- The run keeps paging while a page still holds ids the seen-set has never covered, capped at
  `MAX_PAGES = 10`. A baseline starts with an empty seen-set, so it walks to the cap on its own.
