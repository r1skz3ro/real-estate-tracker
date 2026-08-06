// Single source of truth for portal identity. Phases 04/05/07 import from here rather than
// re-deriving which portal a URL belongs to.
// `ready` is what the browser path waits for before reading the DOM — the cheapest marker that the
// listings are actually there.
export const PORTALS = {
  olx: {
    host: /(^|\.)olx\.pl$/,
    fetchMode: 'browser',
    ready: '[data-cy="l-card"]',
  },
  otodom: {
    host: /(^|\.)otodom\.pl$/,
    fetchMode: 'http',
    ready: 'script#__NEXT_DATA__',
  },
  gratka: {
    host: /(^|\.)gratka\.pl$/,
    fetchMode: 'http',
    ready: '[data-property-id]',
  },
  adresowo: {
    host: /(^|\.)adresowo\.pl$/,
    fetchMode: 'http',
    ready: 'a[data-track="offer-link"]',
  },
  'nieruchomosci-online': {
    host: /(^|\.)nieruchomosci-online\.pl$/,
    fetchMode: 'http',
    ready: 'script[type="application/ld+json"]',
  },
} as const

export type Portal = keyof typeof PORTALS

export const PORTAL_NAMES = Object.keys(PORTALS) as Array<Portal>

// Matched against the parsed hostname, never a substring: nieruchomosci-online.pl.evil.com must not
// match, wroclaw.nieruchomosci-online.pl must.
export function detectPortal(url: string): Portal | null {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }
  return PORTAL_NAMES.find((p) => PORTALS[p].host.test(hostname)) ?? null
}

// Path words that carry no location information, so we keep walking backwards past them.
const FILTER_WORDS = new Set([
  'nieruchomosci',
  'dzialki',
  'dzialka',
  'mieszkania',
  'domy',
  'sprzedaz',
  'wynajem',
  'wyniki',
  'szukaj',
  'oferty',
  'mapa',
  'pl',
  'f',
])

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// "<portal> · <most specific location-ish segment>". Only has to be a decent default — the label is
// editable inline afterwards.
export function deriveLabel(portal: Portal, url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean).reverse()
  for (const raw of segments) {
    // OLX suffixes its own location id: sulistrowice_143815
    const segment = decode(raw).replace(/_\d+$/, '')
    // A dot means a file name (szukaj.html); a leftover digit means a filter/id code (g5_lod, 2).
    if (!segment || segment.includes('.') || /\d/.test(segment)) continue
    if (FILTER_WORDS.has(segment.toLowerCase())) continue
    return `${portal} · ${segment.toLowerCase()}`
  }
  return portal
}
