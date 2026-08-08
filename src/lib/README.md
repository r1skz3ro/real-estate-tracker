# lib

Helpers with no feature of their own, used across several.

## Belongs here

Pure functions that more than one feature needs: `format.ts` (pl-PL price, area, date and the
error-category → friendly-label map) and `utils.ts` (`cn()`).

## Doesn't belong here

Anything only one feature uses — that goes in the feature folder. This is not a junk drawer; a
helper that arrives here should already have two callers.

## Gotchas

- `Intl` formatters are module-level constants, built once. The date formatter pins
  `timeZone: 'Europe/Warsaw'` so the server and the browser render the same string and hydration
  does not mismatch.
- `linkError()` parses the `<category>: <detail>` prefix that `@/server/services/runs.ts` writes to
  `links.lastError`. Amber vs red is the point: a timeout usually fixes itself, a layout change
  never does. Change the categories on one side and the other silently falls through to "refresh
  failed".
