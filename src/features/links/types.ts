import type { listLinksFn } from '@/server/controllers/links'

export type Link = Awaited<ReturnType<typeof listLinksFn>>[number]
