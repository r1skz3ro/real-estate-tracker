# Phase 05 — Parsers

**Goal:** turn each portal's HTML into a normalised listing array. This is the only code in the
project that rots without you touching it, so it is also the only code with a real test suite.

## Contract

```ts
export type ParsedListing = {
  externalId: string      // portal's own stable id
  url: string             // absolute
  title: string
  price: number | null    // whole PLN
  currency: string        // 'PLN'
  areaM2: number | null
  pricePerM2: number | null
  location: string | null
  imageUrl: string | null
}

export type ParseResult = {
  listings: ParsedListing[]   // in page order, newest first
  emptyState: boolean         // page explicitly said "no results"
}

export type Parser = (html: string, pageUrl: string) => ParseResult
```

`emptyState` is what separates "quiet week" from "parser broken". Phase 07 errors the link **only**
on `listings.length === 0 && !emptyState`.

Order matters: the array must preserve page order, because phase 06's removal detection reasons about
position.

## Shared helpers (`src/server/parsers/util.ts`)

```ts
parsePlNumber(s: string): number | null
```
Polish portals separate thousands with **NBSP (U+00A0)** and sometimes narrow NBSP (U+202F), and use
a comma for decimals: `389 000 zł`, `1 556 m²`, `190,58 zł/m²`. Strip `  \s`, swap `,`→`.`,
then parse. Return null on failure rather than `NaN`.

```ts
derivePricePerM2(price, areaM2)  // only when the portal doesn't supply it, and area > 0
absoluteUrl(href, pageUrl)       // new URL(href, pageUrl).toString()
```

Use **cheerio** for the HTML portals. Do not anchor on CSS classes — gratka ships Vue scoped-hash
classes and adresowo ships Tailwind utilities; both churn. Anchor on `data-*` attributes and
structure.

## `otodom.ts` — JSON, most reliable

```ts
html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
```
The tag carries extra attributes (`type`, `crossorigin`) — the regex must allow them. Then
`props.pageProps.data.searchAds.items` (verified: 19 items on the example URL).

Per item: `id` → externalId, `href` (present on the item; else build from `slug`) → url, `title`,
`totalPrice.value` / `.currency`, `areaInSquareMeters`, `pricePerSquareMeter.value`,
`location` → a readable string, `images[0].medium` → imageUrl.

`hidePrice: true` items have no price — store `null`, do not drop the listing.

Empty state: `searchAds.items` is an empty array while the JSON parsed fine → `emptyState: true`.
That is an honest signal here; no marker hunting needed.

## `nieruchomosciOnline.ts` — ld+json, no selectors

Collect every `<script type="application/ld+json">`, `JSON.parse` each, and take the block with
`"@type": "CollectionPage"`. Its `mainEntity` is the offer array (verify exact nesting against the
fixture — if it is wrapped in `itemListElement`, unwrap).

Per offer: `url` → url, externalId = `/(\d+)\.html$/` from the url, `name` → title,
`price` → price, `priceSpecification.price` → pricePerM2, `image` → imageUrl,
`itemOffered.address.addressLocality` → location, `itemOffered.floorSize.value` → areaM2.

## `gratka.ts`

Cards: `[data-property-id]` (also carry `data-cy="card"`). Link: `a[data-cy="propertyUrl"]` →
`/nieruchomosci/<slug>/ob/<id>`. **externalId = the `/ob/(\d+)` number**, not `data-property-id` —
the `/ob/` id is the one in the public URL. Fall back to `data-property-id` if the href is missing.

Useful shortcut: each card's first anchor (`a.property-card__link`) contains an SEO text line with
everything in it:

```
Działka na sprzedaż, 7000 m², Świebodzice 7 000 m² 360 000 zł Świebodzice, świdnicki, dolnośląskie
```

Parse title / area / price / location out of that text with regexes (`([\d\s ]+)\s*m²`,
`([\d\s ]+)\s*zł`). It survives markup churn better than hunting per-field elements. Image:
first `img[src]` inside the card that is not an icon from `gratka.pl/nuxt-assets/`.

## `adresowo.ts`

Anchors: `a[data-track="offer-link"]`, href `/o/<slug>` → externalId = the full slug (e.g.
`dzialka-budowlana-sobotka-sulistrowice-ul-aroniowa-v3j5b2`).

Card container = nearest ancestor of the anchor that also contains a `<picture>` element. Walk up
with `.parents()` and take the first match — do not hardcode a class.

Inside the card: price and area are adjacent `<p>` blocks shaped
`<span class="font-bold">389&nbsp;000</span><span>zł</span>` and `<span class="font-bold">1556</span><span>m²</span>`.
Read them by their unit text (`zł`, `m²`), not by class. Location: the first two spans inside the
anchor (`Sulistrowice`, `ul. Aroniowa`) joined. Image: `picture img[src]`.

`pricePerM2` is not published — derive it.

## `olx.ts` — browser-rendered HTML

Cards: `[data-cy="l-card"]`. Link: `a[href^="/d/oferta/"]`, made absolute against `https://www.olx.pl`.
externalId = the `-ID([A-Za-z0-9]+)\.html` capture (e.g. `ID1b5hGP`); fall back to the card's `id`.

**Skip cards linking off-site.** OLX injects otodom listings into its results (75 `otodom.pl`
references in the captured page). Only keep hrefs starting `/d/oferta/`, otherwise the same listing
gets tracked twice under two portals.

Fields: title from `[data-cy="ad-card-title"]` / the card `h4`; price from `[data-testid="ad-price"]`;
location + date from `[data-testid="location-date"]` (`"Sulistrowice - Odświeżono dnia 5 sierpnia 2026"`)
— split on ` - ` and keep the location half. Area is often absent on OLX plot cards; `null` is
acceptable and the UI renders `—`. Image: card `img[src]`, ignoring the placeholder/no-photo asset.

## Fixtures and tests

`fixtures/raw/` already holds live captures made during planning — reuse them, do not re-scrape:

```
otodom-search.html                 (19 listings)
nieruchomosci-online-search.html
gratka-search.html                 (66 /ob/ links)
adresowo-search.html               (39 offer links)
olx-search.html                    (65 l-cards, browser-rendered)
```

Move them to `src/server/parsers/__fixtures__/` and commit them. Then capture **one empty-result page
per portal** (a search for a nonexistent village works) and commit those too as `*-empty.html`.

> Record each portal's real empty-state marker from those captures. Do **not** guess the Polish
> wording — check what the page actually renders. Portals differ ("Nie znaleziono ogłoszeń",
> "Brak ofert", a zero-count header, or simply an empty JSON array).

`parsers.test.ts` asserts, per portal:

1. the fixture yields the expected listing count (exact number, so silent partial breakage fails);
2. every listing has a non-empty `externalId`, `url` and `title`;
3. at least 80% have a non-null `price` — tolerating genuine "ask for price" listings while catching
   a broken price selector;
4. `externalId` values are unique within the result;
5. urls are absolute and point at that portal's host;
6. the `*-empty.html` fixture returns `emptyState: true` and zero listings.

## Done when

`pnpm test` is green across all five portals plus the five empty-state fixtures, and a deliberate
one-character break in any selector makes that portal's test fail.
