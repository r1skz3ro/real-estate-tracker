# components

Shared, feature-agnostic UI. In practice that is `ui/` and nothing else.

## Belongs here

A component used by two or more features that carries no domain knowledge.

## Doesn't belong here

Application components. Anything that knows what a project, link, run or listing is lives in
`src/features/<feature>/`, even if only one route renders it.

## Gotcha

The folder exists because `components.json` points the shadcn CLI at `@/components/ui`. Moving or
renaming it means fighting the generator on every `pnpm dlx shadcn@latest add`.
