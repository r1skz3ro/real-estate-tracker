import { Link as RouterLink } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RefreshButton } from '@/features/runs/RefreshButton'
import { cn } from '@/lib/utils'
import { linkState } from './linkState'
import type { Link, LinkStats } from './types'
import type { LinkRunPlane } from './useLinkRun'

export function LinkHeader({
  link,
  stats,
  projectName,
  run,
}: {
  link: Link
  stats: LinkStats | undefined
  projectName: string
  run: LinkRunPlane
}) {
  // The live row wins over the stored status, exactly as it does on the project page's link row.
  const live = run.runs[0]
  const { status, dot, text, title, tone } = linkState(
    link,
    run.running ? live : undefined,
    run.running ? (live?.runStartedAt ?? undefined) : undefined,
  )

  return (
    <Card>
      <CardHeader>
        <Breadcrumb className="mb-2">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <RouterLink
                  to="/projects/$projectId"
                  params={{ projectId: String(link.projectId) }}
                >
                  {projectName}
                </RouterLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{link.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <CardTitle className="flex min-w-0 items-center gap-2">
          <span
            title={status}
            className={cn('size-2 shrink-0 rounded-full', dot)}
          />
          <span className="truncate">{link.label}</span>
          <Badge asChild variant="secondary">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              title={link.url}
            >
              {link.portal}
            </a>
          </Badge>
          {link.fetchMode === 'browser' && (
            <Badge variant="outline" className="text-amber-400">
              browser
            </Badge>
          )}
        </CardTitle>

        <CardDescription className="flex flex-wrap items-center gap-x-2 tabular-nums">
          <span>{stats?.tracked ?? 0} tracked</span>
          <span>·</span>
          <span>{stats?.live ?? 0} live</span>
          {(stats?.unread ?? 0) > 0 && (
            <>
              <span>·</span>
              <span className="text-foreground">{stats?.unread} unread</span>
            </>
          )}
          {text && (
            <>
              <span>·</span>
              <span
                title={title ?? undefined}
                className={cn(
                  tone === 'red' && 'text-destructive',
                  tone === 'amber' && 'text-amber-400',
                )}
              >
                {text}
              </span>
            </>
          )}
        </CardDescription>

        <CardAction>
          <RefreshButton
            running={run.running}
            starting={run.starting}
            start={run.start}
          />
        </CardAction>
      </CardHeader>
    </Card>
  )
}
