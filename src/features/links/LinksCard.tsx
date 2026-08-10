import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RefreshButton } from '@/features/runs/RefreshButton'
import { AddLinkForm } from './AddLinkForm'
import { LinkRow } from './LinkRow'
import { MAX_LINKS } from './constants'
import type { Link } from './types'
import type { Run } from '@/features/runs/useRun'

export function LinksCard({
  projectId,
  links,
  run,
}: {
  projectId: number
  links: Array<Link>
  run: Run
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search links</CardTitle>
        <CardDescription>
          {run.running
            ? 'Refreshing — 3–8s between requests, so a full project takes a minute or two.'
            : `${links.length} of ${MAX_LINKS} saved searches.`}
        </CardDescription>
        <CardAction>
          <RefreshButton
            running={run.running}
            starting={run.starting}
            start={run.start}
            disabled={links.length === 0}
          />
        </CardAction>
      </CardHeader>

      {links.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              runLink={run.byLinkId.get(link.id)}
              startedAt={run.startedAt}
            />
          ))}
        </ul>
      )}

      <CardContent className="space-y-2">
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No search links yet — add a search URL below, sorted newest-first.
          </p>
        )}
        <AddLinkForm projectId={projectId} atCap={links.length >= MAX_LINKS} />
      </CardContent>
    </Card>
  )
}
