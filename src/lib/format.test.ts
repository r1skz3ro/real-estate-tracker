import { expect, test } from 'vitest'
import { linkError } from './format'

test('a layout change is red, a transport failure is amber', () => {
  expect(linkError('blocked: HTTP 403')).toEqual({
    tone: 'red',
    text: 'blocked by portal',
  })
  expect(
    linkError('parse-broken: 0 listings and no empty-state marker'),
  ).toEqual({
    tone: 'red',
    text: 'page layout changed — parser needs updating',
  })
  expect(linkError('timeout: The operation timed out')?.tone).toBe('amber')
  expect(linkError('network: fetch failed')?.tone).toBe('amber')
  // A 404 is the portal answering clearly — waiting will not fix it, so red, not amber.
  expect(linkError('not-found: HTTP 404')?.tone).toBe('red')
})

test('unrecognised categories still say something', () => {
  expect(linkError('unknown: unsupported portal')).toEqual({
    tone: 'red',
    text: 'refresh failed',
  })
  expect(linkError('no colon here')?.text).toBe('refresh failed')
})

test('no error means no message', () => {
  expect(linkError(null)).toBeNull()
  expect(linkError('')).toBeNull()
})
