import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createLink, deleteLink, listLinks, updateLink } from '#/db/queries'
import { PORTALS, PORTAL_NAMES, deriveLabel, detectPortal } from './portals'

export const MAX_LINKS = 10

export const listLinksFn = createServerFn({ method: 'GET' })
  .validator(z.number().int())
  .handler(({ data }) => listLinks(data))

// Split out of the server fn only so it is callable without the Start runtime — the wrapper needs
// an AsyncLocalStorage context that a test process doesn't have.
export function addLink(projectId: number, url: string) {
  // All four checks are server-side; the form's are UX only.
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("That doesn't look like a URL")
  }
  if (parsed.protocol !== 'https:')
    throw new Error('Only https:// URLs are supported')

  const portal = detectPortal(url)
  if (!portal)
    throw new Error(
      `Unsupported portal — use one of: ${PORTAL_NAMES.join(', ')}`,
    )

  const existing = listLinks(projectId)
  if (existing.length >= MAX_LINKS)
    throw new Error(
      `${MAX_LINKS} of ${MAX_LINKS} links — remove one to add another`,
    )
  if (existing.some((l) => l.url === url))
    throw new Error('That URL is already on this project')

  return createLink({
    projectId,
    url,
    portal,
    label: deriveLabel(portal, url),
    fetchMode: PORTALS[portal].fetchMode,
  })
}

export const addLinkFn = createServerFn({ method: 'POST' })
  .validator(z.object({ projectId: z.number().int(), url: z.string() }))
  .handler(({ data }) => addLink(data.projectId, data.url))

export const renameLinkFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id: z.number().int(), label: z.string().min(1).max(80) }),
  )
  .handler(({ data: { id, label } }) => updateLink(id, { label }))

export const deleteLinkFn = createServerFn({ method: 'POST' })
  .validator(z.number().int())
  .handler(({ data }) => deleteLink(data))
