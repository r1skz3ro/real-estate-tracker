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
