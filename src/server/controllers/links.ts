import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { deleteLink, listLinks, updateLink } from '@/server/models/queries'
import { addLink } from '@/server/services/links'

// Every server symbol above is referenced only inside a handler body, on purpose. Handler bodies
// are the only thing stripped from the client bundle; touch one of these imports at module scope
// and better-sqlite3 follows it into the browser, which kills hydration.
export const listLinksFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => listLinks(data))

export const addLinkFn = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.number().int(), url: z.string() }))
  .handler(({ data }) => addLink(data))

export const renameLinkFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id: z.number().int(), label: z.string().min(1).max(80) }),
  )
  .handler(({ data: { id, label } }) => updateLink(id, { label }))

export const deleteLinkFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => deleteLink(data))
