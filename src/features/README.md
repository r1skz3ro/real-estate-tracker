# features

Client-side application code, one folder per feature: `projects`, `links`, `runs`, `findings`.

## What a feature folder holds

| File                         | Role                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `Thing.tsx`                  | Presentation. Props in, JSX out.                                      |
| `useThing.ts`                | Hooks: queries, mutations, state, effects, cache invalidation.        |
| `thing.ts` + `thing.test.ts` | Pure logic — derivations, summaries, formatting.                      |
| `types.ts`                   | Types shared by ≥2 files in the feature, derived from the server fns. |
| `schema.ts` / `constants.ts` | Client-safe contracts the server also imports.                        |

## Rules

- **No `index.ts` barrels.** A barrel that re-exports a component next to a contract is how server
  code reaches the browser bundle. Import the exact file: `@/features/links/LinkRow`.
- **Contracts are dependency-free leaves.** `constants.ts` and `schema.ts` are imported by
  `src/server/` because the browser must be able to import them too. That is the only direction in
  which the server may depend on a feature.
- One `.tsx` per major UI block. Small private subcomponents (`Filter`, `Thumb`) stay in their
  parent file rather than earning one of their own.
- No per-feature styles: Tailwind utilities and the one theme in `src/styles.css`. Add a `.css`
  file only for something utilities cannot express — a keyframe, a container query.
- Features may import each other's components and types (`links` renders `runs`' RefreshButton).
