# Phase 03 — Links

**Goal:** add and remove portal search URLs on a project. Max 10. Only the five supported portals.

## Portal detection (`src/server/portals.ts`)

This module is the single source of truth about portals and is imported by phases 04, 05 and 07.

```ts
export const PORTALS = {
  'olx':                  { host: /(^|\.)olx\.pl$/,                   fetchMode: 'browser' },
  'otodom':               { host: /(^|\.)otodom\.pl$/,                fetchMode: 'http' },
  'gratka':               { host: /(^|\.)gratka\.pl$/,                fetchMode: 'http' },
  'adresowo':             { host: /(^|\.)adresowo\.pl$/,              fetchMode: 'http' },
  'nieruchomosci-online': { host: /(^|\.)nieruchomosci-online\.pl$/,  fetchMode: 'http' },
} as const
export type Portal = keyof typeof PORTALS
export function detectPortal(url: string): Portal | null
```

Match on the parsed `URL().hostname`, never on substring — `nieruchomosci-online.pl.evil.com` must
not match, and `wroclaw.nieruchomosci-online.pl` must.

OLX is seeded as `browser` because plain HTTP is verified-blocked. The rest start on `http` and may
be escalated later by phase 04.

## Adding a link

Server function `addLinkFn({ projectId, url })`:

1. Parse the URL; reject non-`https:` and anything unparseable.
2. `detectPortal()` → on null, reject with a message naming all five supported portals.
3. Reject if the project already has 10 links, or if this exact URL is already on the project.
4. Derive a label, store, return.

Do all four checks server-side. Client-side duplicates are for UX only.

## Label derivation

Cheap and good enough: `"<portal> · <most specific location-ish path segment>"`, e.g.
`olx · sulistrowice`, `adresowo · sulistrowice`. Take the last path segment that is not a bare
number, a known filter word, or a file name; fall back to the portal name alone. The label is
editable inline afterwards — the derivation only has to be a decent default.

## UI

On the project page, a link list showing: label, portal badge, `fetchMode` (only when `browser`),
status dot, and a delete button. An add form with a URL field.

At 10 links, disable the form and show "10 of 10 links — remove one to add another."

Status dot is grey `pending` for now; phases 07 and 10 give it real meaning.

## Done when

All five example URLs are accepted on one project and identified correctly:

```
https://www.olx.pl/nieruchomosci/dzialki/sprzedaz/sulistrowice_143815/?search%5Bdist%5D=5&search%5Border%5D=created_at:desc
https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie/wroclawski/sobotka/sulistrowice?distanceRadius=5&limit=36&priceMax=300000&by=LATEST&direction=DESC
https://wroclaw.nieruchomosci-online.pl/szukaj.html?3,dzialka,sprzedaz,,Sulistrowiczki:44767,,,25,-250000,,,,,,,,,,,,,,1
https://adresowo.pl/f/dzialki/sulistrowice/g5_lod
https://gratka.pl/mapa/nieruchomosci/dzialki-grunty?page=2&location%5Bmap%5D=1&location%5Bmap_bounds%5D=51.0010036,17.0583365:50.52750631,16.32337472&location%5Bcustom_area%5D=019fc1cc-1abd-726a-855e-db019fdc6608&sort=newest
```

- OLX shows `fetchMode: browser`, the other four `http`.
- `https://www.morizon.pl/dzialki/` is rejected naming the supported portals.
- A duplicate URL is rejected; an 11th link is refused.
