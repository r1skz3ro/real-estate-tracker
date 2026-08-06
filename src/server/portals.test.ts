import { expect, test } from 'vitest'
import { deriveLabel, detectPortal } from './portals'

// The five URLs from phase 03's "Done when", verbatim.
const EXAMPLES = [
  [
    'https://www.olx.pl/nieruchomosci/dzialki/sprzedaz/sulistrowice_143815/?search%5Bdist%5D=5&search%5Border%5D=created_at:desc',
    'olx',
    'olx · sulistrowice',
  ],
  [
    'https://www.otodom.pl/pl/wyniki/sprzedaz/dzialka/dolnoslaskie/wroclawski/sobotka/sulistrowice?distanceRadius=5&limit=36&priceMax=300000&by=LATEST&direction=DESC',
    'otodom',
    'otodom · sulistrowice',
  ],
  [
    'https://wroclaw.nieruchomosci-online.pl/szukaj.html?3,dzialka,sprzedaz,,Sulistrowiczki:44767,,,25,-250000,,,,,,,,,,,,,,1',
    'nieruchomosci-online',
    // every path segment is a file name — falls back to the portal alone
    'nieruchomosci-online',
  ],
  [
    'https://adresowo.pl/f/dzialki/sulistrowice/g5_lod',
    'adresowo',
    'adresowo · sulistrowice',
  ],
  [
    'https://gratka.pl/mapa/nieruchomosci/dzialki-grunty?page=2&location%5Bmap%5D=1&location%5Bmap_bounds%5D=51.0010036,17.0583365:50.52750631,16.32337472&location%5Bcustom_area%5D=019fc1cc-1abd-726a-855e-db019fdc6608&sort=newest',
    'gratka',
    'gratka · dzialki-grunty',
  ],
] as const

test.each(EXAMPLES)('%s', (url, portal, label) => {
  expect(detectPortal(url)).toBe(portal)
  expect(deriveLabel(portal, url)).toBe(label)
})

test('matches on hostname, not substring', () => {
  expect(
    detectPortal('https://wroclaw.nieruchomosci-online.pl/szukaj.html'),
  ).toBe('nieruchomosci-online')
  expect(detectPortal('https://nieruchomosci-online.pl.evil.com/x')).toBeNull()
  expect(detectPortal('https://notolx.pl/x')).toBeNull()
  expect(detectPortal('https://www.morizon.pl/dzialki/')).toBeNull()
  expect(detectPortal('not a url')).toBeNull()
})
