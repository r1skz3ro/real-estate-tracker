import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { RunSection } from './RunSection'
import {
  NO_FILTER,
  anyUnread,
  applyFilters,
  isFiltering,
  portalsIn,
} from './summarize'
import { TYPE_FILTERS } from './types'
import { useFindings, useMarkProjectRead, useMarkRunRead } from './useFindings'
import type { Filters } from './summarize'

export function Findings({ projectId }: { projectId: number }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTER)
  const { query, loadMore } = useFindings(projectId)
  const markRun = useMarkRunRead(projectId)
  const markProject = useMarkProjectRead(projectId)

  const runs = query.data?.runs ?? []
  const portals = portalsIn(runs)
  const visible = applyFilters(runs, filters)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Changes</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            disabled={!anyUnread(runs) || markProject.isPending}
            onClick={() => markProject.mutate({ data: projectId })}
          >
            Mark everything read
          </Button>
        </CardAction>
      </CardHeader>

      {portals.length > 0 && (
        <CardContent className="flex flex-wrap items-center gap-1">
          {TYPE_FILTERS.map((t) => (
            <Filter
              key={t}
              active={filters.type === t}
              onClick={() => setFilters((f) => ({ ...f, type: t }))}
            >
              {t}
            </Filter>
          ))}
          {portals.length > 1 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              {['all', ...portals].map((p) => (
                <Filter
                  key={p}
                  active={filters.portal === p}
                  onClick={() => setFilters((f) => ({ ...f, portal: p }))}
                >
                  {p === 'all' ? 'all portals' : p}
                </Filter>
              ))}
            </>
          )}
        </CardContent>
      )}

      <CardContent className="space-y-4">
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Could not load changes: {query.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isFiltering(filters)
              ? 'Nothing matches those filters.'
              : 'No changes yet — refresh to set a baseline.'}
          </p>
        ) : (
          visible.map((run) => (
            <RunSection
              key={run.id}
              run={run}
              onRead={markRun.mutate}
              pending={markRun.isPending}
            />
          ))
        )}

        {query.data?.hasMore && (
          <Button variant="secondary" size="sm" onClick={loadMore}>
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Filter({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="xs"
      onClick={onClick}
      className={cn(!active && 'text-muted-foreground')}
    >
      {children}
    </Button>
  )
}
