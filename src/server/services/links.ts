import { MAX_LINKS } from '@/features/links/constants'
import {
  archiveLinkListings,
  createLink,
  getLink,
  listLinks,
  tx,
  updateLink,
} from '@/server/models/queries'
import {
  PORTALS,
  PORTAL_NAMES,
  deriveLabel,
  detectPortal,
} from '@/server/scraping/portals'
import { startRun } from './runs'
import type { Portal } from '@/server/scraping/portals'

// Shared by add and update: a link's portal is derived from its URL, so both have to agree on what
// makes a URL usable.
function validateSearchUrl(url: string): Portal {
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
  return portal
}

// All checks are server-side; the form's are UX only.
export function addLink({
  projectId,
  url,
}: {
  projectId: number
  url: string
}) {
  const portal = validateSearchUrl(url)

  const existing = listLinks(projectId)
  if (existing.length >= MAX_LINKS)
    throw new Error(
      `${MAX_LINKS} of ${MAX_LINKS} links — remove one to add another`,
    )
  if (existing.some((l) => l.url === url))
    throw new Error('That URL is already on this project')

  const link = createLink({
    projectId,
    url,
    portal,
    label: deriveLabel(portal, url),
    fetchMode: PORTALS[portal].fetchMode,
  })

  // The baseline is also the validation: whether the URL really resolves, whether the portal serves
  // it to us, and whether the parser still understands the page are all things only a fetch knows.
  // A 404 or a block lands on the link as a real error with a log, instead of waiting for a refresh.
  const { runId } = startRun(projectId, link.id)
  return { link, runId }
}

export function updateLinkConfig({
  id,
  label,
  url,
  fetchMode,
}: {
  id: number
  label?: string
  url?: string
  fetchMode?: string
}) {
  const link = getLink(id)
  if (!link) throw new Error('Link not found')

  const data: Parameters<typeof updateLink>[1] = {}
  if (label !== undefined) data.label = label
  if (fetchMode !== undefined) data.fetchMode = fetchMode

  if (url === undefined || url === link.url)
    return updateLink(id, { ...data, ...(url === undefined ? {} : { url }) })

  const portal = validateSearchUrl(url)
  if (listLinks(link.projectId).some((l) => l.id !== id && l.url === url))
    throw new Error('That URL is already on this project')

  // A different search is a different pool, so the old results stop being this link's seen-set.
  // They are archived rather than deleted (rule 4) and no events are written — nobody took those
  // offers down, we stopped looking at them — and the next fetch re-baselines instead of reporting
  // a whole search as news.
  return tx(() => {
    archiveLinkListings(id, new Date())
    return updateLink(id, {
      ...data,
      url,
      portal,
      // A manual override is not carried across to a different portal; the new one's default wins
      // and the fetch layer escalates again if it has to.
      fetchMode: fetchMode ?? PORTALS[portal].fetchMode,
      baselinedAt: null,
      status: 'pending',
      lastError: null,
    })
  })
}
