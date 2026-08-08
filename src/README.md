# src

The whole application. Two sides, split at `server/`.

| Folder          | What it is                                                                              |
| --------------- | --------------------------------------------------------------------------------------- |
| `routes/`       | TanStack Start file-based routes. Thin shells — route def, loader, composition.         |
| `features/`     | Client feature folders. All app UI lives here, one folder per feature.                  |
| `components/`   | shadcn/ui primitives only (`ui/`). Not a home for app components.                       |
| `lib/`          | Cross-feature helpers with no feature of their own (`format.ts`, `cn()`).               |
| `server/`       | The entire backend, MVC-shaped: `controllers` → `services` → `models`, plus `scraping`. |
| `integrations/` | Third-party wiring (the React Query provider).                                          |

## Two rules that hold the structure together

1. **`.tsx` is markup and props. `.ts` is logic and its test.** Hooks, derivations and formatting
   live in `.ts` siblings next to the component that uses them. This is why the logic is testable
   at all: `vitest.config.ts` runs `src/**/*.test.ts` under plain node, no jsdom, no React plugin.
2. **Only handler bodies get stripped from the client bundle.** Anything a `.tsx` imports at module
   scope ships to the browser. Import `@/server/controllers/*` from the client for server fns and
   `import type` only — never a service, never a model.

Imports: `@/…` across folders, relative within one. `@/*` → `./src/*` is the only alias.
