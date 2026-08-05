# Phase 00 — Scaffold

**Goal:** a running TanStack Start app with strict TypeScript, linting, formatting and a test runner.
No features.

## Watch out

The project directory is **not empty** — it already contains `.claude/`, `phases/`, `fixtures/` and a
stub `package.json`. Scaffolders refuse to run in a non-empty directory.

Do this: scaffold into a temp directory, then move the generated files in, keeping the existing
folders. The stub `package.json` (name `estate-tracker`, no real deps) is throwaway — let the
generated one replace it.

```bash
cd /tmp && npm create start-app@latest estate-scaffold -- --template typescript
# then move contents into the project dir, preserving .claude/ phases/ fixtures/
```

Pick React + TypeScript. If the scaffolder offers Tailwind, take it — the UI in phases 02/08 assumes
utility classes and you do not want to retrofit a styling decision later.

## Dependencies

Verified current at planning time:

```
drizzle-orm@0.45   better-sqlite3@13   playwright@1.62   node-cron@4.6   cheerio@1.2   zod
-D drizzle-kit  vitest  @types/better-sqlite3  eslint  prettier
```

`@tanstack/react-query` ships with Start (`@tanstack/react-start@1.168`, `react-router@1.170`) —
use it. Do **not** add a second data-fetching library.

Run `pnpm exec playwright install chromium` once (~150MB). Only Chromium, not all browsers.

## Setup

- **TypeScript**: `strict: true`, `noUncheckedIndexedAccess: true`. Scraper code indexes into arrays
  constantly and this catches the resulting `undefined` bugs at compile time.
- **ESLint + Prettier**: flat config, Prettier as the formatter with ESLint not duplicating format
  rules. Scripts: `lint`, `format`, `test`, `typecheck`.
- **Vitest**: node environment (everything tested in later phases is server-side — parsers and the
  diff engine; no jsdom needed).
- **.gitignore**: add `data/` (SQLite + browser state) and `node_modules`.

## App shell

One layout route: left sidebar listing projects, main pane for content. Placeholder content is fine —
phase 02 fills it in. Keep it plain; no component library.

## Files

```
package.json  tsconfig.json  eslint.config.js  .prettierrc  vitest.config.ts  .gitignore
src/routes/__root.tsx        # layout: sidebar + main
src/routes/index.tsx         # placeholder
```

## Done when

- `pnpm dev` serves the shell without console errors.
- `pnpm lint && pnpm typecheck && pnpm test` all exit 0 (a zero-test run is acceptable here).
- `pnpm exec playwright install chromium` has completed.
- `fixtures/raw/` still contains the five captured HTML files.
