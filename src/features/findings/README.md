# features/findings

The changes timeline: what each run found, grouped by run, newest first, with read/unread state.

## Belongs here

`Findings` (container + filters), `RunSection`, `EventCard`, the query/mutation hooks, the
`useAutoRead` observer, and `summarize.ts` — filtering (type, portal, price range), portal lists,
counts and the price-drop test as pure functions.

## Doesn't belong here

Starting a refresh (`features/runs`) and the link rows above the timeline (`features/links`).

## Gotchas

- **A run with zero events still renders.** "We checked and found nothing" is a result, not an
  empty state — a quiet run parses ~30 listings and finds 0 changes. Runs only disappear from the
  list while a filter is on.
- Marking read invalidates the `['findings', projectId]` query _and_ the router: the sidebar's
  unread badge comes from the root loader, so refreshing one without the other leaves a stale count.
- `useAutoRead` arms only while a section still has unread events and latches itself with a ref, so
  it cannot fire twice while the invalidated query is in flight.
- Thumbnails are hotlinked and some portals reject the referer. A broken image is expected; it
  falls back rather than retrying or proxying.
- The price range filters on the listing's _current_ price, and a bound hides listings with no price
  at all ("cena do negocjacji") — they can't answer a budget question. The preset dropdown is a
  native `<datalist>`, so any number can still be typed.
