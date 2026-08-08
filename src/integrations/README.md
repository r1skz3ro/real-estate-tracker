# integrations

Wiring for third-party libraries that need a provider or a devtools panel — kept out of `features/`
and `routes/` so those stay about this app.

## Belongs here

Setup code for a library: the client instance, its provider, its devtools registration.

## Doesn't belong here

Anything that uses the library. Calling `useQuery` is a feature's job.

## Gotcha

`tanstack-query/root-provider.tsx`'s `getContext()` is consumed by `src/router.tsx` and typed into
the router context, so every route can reach the same `QueryClient`. Creating a second one anywhere
gives you a second, empty cache.
