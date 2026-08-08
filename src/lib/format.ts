// Both fraction digits are set: `currency` defaults minimumFractionDigits to 2, and a maximum below
// the minimum throws a RangeError. `useGrouping: 'always'` because pl-PL's default leaves four-digit
// numbers ungrouped — 1556 m², not 1 556 m² (`true` normalises to "always").
const grouped = { useGrouping: true, maximumFractionDigits: 0 } as const

const pln = new Intl.NumberFormat('pl-PL', {
  ...grouped,
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 0,
})

const plain = new Intl.NumberFormat('pl-PL', grouped)

// Timezone pinned so the server and the browser render the same string.
const when = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Warsaw',
})

const DASH = '—'

export const fmtPrice = (n: number | null) => (n == null ? DASH : pln.format(n))

export const fmtArea = (n: number | null) =>
  n == null ? DASH : `${plain.format(n)} m²`

export const fmtPerM2 = (n: number | null) =>
  n == null ? DASH : `${pln.format(n)}/m²`

export const fmtWhen = (d: Date | string | number) => when.format(new Date(d))

// Amber vs red is the whole point: a timeout usually fixes itself, a layout change never does.
// Categories are the part before the colon in what run.ts's reasonFor() writes to links.lastError.
const ERRORS = {
  blocked: { tone: 'red', text: 'blocked by portal' },
  'parse-broken': {
    tone: 'red',
    text: 'page layout changed — parser needs updating',
  },
  'not-found': { tone: 'red', text: 'search URL is dead (404)' },
  timeout: { tone: 'amber', text: "couldn't reach portal" },
  network: { tone: 'amber', text: "couldn't reach portal" },
} as const

const UNKNOWN = { tone: 'red', text: 'refresh failed' } as const

export function linkError(reason: string | null | undefined) {
  if (!reason) return null
  const match = Object.entries(ERRORS).find(([category]) =>
    reason.startsWith(`${category}:`),
  )
  return match?.[1] ?? UNKNOWN
}
