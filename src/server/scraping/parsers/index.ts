import { parseAdresowo } from './adresowo'
import { parseGratka } from './gratka'
import { parseNieruchomosciOnline } from './nieruchomosciOnline'
import { parseOlx } from './olx'
import { parseOtodom } from './otodom'
import type { Parser } from './util'
import type { Portal } from '../portals'

export const PARSERS: Record<Portal, Parser> = {
  otodom: parseOtodom,
  'nieruchomosci-online': parseNieruchomosciOnline,
  gratka: parseGratka,
  adresowo: parseAdresowo,
  olx: parseOlx,
}
