import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  deleteLink,
  getLink,
  linkListingsPage,
  linkRuns,
  linkStats,
  listLinks,
} from '@/server/models/queries'
import { addLink, updateLinkConfig } from '@/server/services/links'

// Every server symbol above is referenced only inside a handler body, on purpose. Handler bodies
// are the only thing stripped from the client bundle; touch one of these imports at module scope
// and better-sqlite3 follows it into the browser, which kills hydration.
export const listLinksFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => listLinks(data))

// One call for the whole link page header: the row plus the counts it reports.
export const getLinkFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => {
    const link = getLink(data)
    if (!link) throw new Error('Link not found')
    return { link, stats: linkStats(data) }
  })

export const linkListingsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      linkId: z.number().int(),
      limit: z.number().int().min(1).max(200).default(20),
      offset: z.number().int().min(0).default(0),
      filter: z.enum(['all', 'live', 'removed']).default('all'),
    }),
  )
  .handler(({ data: { linkId, ...page } }) => linkListingsPage(linkId, page))

export const linkRunsFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      linkId: z.number().int(),
      limit: z.number().int().min(1).max(200).default(20),
    }),
  )
  .handler(({ data: { linkId, limit } }) => linkRuns(linkId, limit))

export const addLinkFn = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.number().int(), url: z.string() }))
  .handler(({ data }) => addLink(data))

export const updateLinkFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.number().int(),
      label: z.string().min(1).max(80).optional(),
      url: z.string().optional(),
      fetchMode: z.enum(['http', 'browser']).optional(),
    }),
  )
  .handler(({ data }) => updateLinkConfig(data))

export const deleteLinkFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => deleteLink(data))
