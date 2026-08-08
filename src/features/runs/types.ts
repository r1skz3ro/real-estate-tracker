import type { getRunStatusFn } from '@/server/controllers/runs'

export type RunStatus = NonNullable<Awaited<ReturnType<typeof getRunStatusFn>>>
export type RunLink = RunStatus['links'][number]
