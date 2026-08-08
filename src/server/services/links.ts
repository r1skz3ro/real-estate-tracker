import { MAX_LINKS } from '@/features/links/constants'
import { createLink, listLinks } from '@/server/models/queries'
import {
  PORTALS,
  PORTAL_NAMES,
  deriveLabel,
  detectPortal,
} from '@/server/scraping/portals'

// All four checks are server-side; the form's are UX only.
export function addLink({
  projectId,
  url,
}: {
  projectId: number
  url: string
}) {
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
