import { Link as RouterLink } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { linkState } from './linkState'
import { useDeleteLink } from './useLinks'
import type { Link } from './types'
import type { RunLink, RunStatus } from '@/features/runs/types'

export function LinkRow({
  link,
  runLink,
  startedAt,
}: {
  link: Link
  runLink: RunLink | undefined
  startedAt: RunStatus['run']['startedAt'] | undefined
}) {
  const remove = useDeleteLink()
  const { status, dot, text, title, tone } = linkState(link, runLink, startedAt)

  return (
    <li className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-accent/30">
      <span
        title={status}
        className={cn('size-2 shrink-0 rounded-full', dot)}
      />
      {/* The row is the way into the link's own page — its config, listings and logs live there,
          which is also why the label is no longer editable in place. */}
      <RouterLink
        to="/projects/$projectId/links/$linkId"
        params={{
          projectId: String(link.projectId),
          linkId: String(link.id),
        }}
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm hover:underline"
      >
        <span className="truncate">{link.label}</span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      </RouterLink>
      {text && (
        <span
          title={title ?? undefined}
          className={cn(
            'max-w-80 shrink truncate text-xs tabular-nums',
            tone === 'red' && 'text-destructive',
            tone === 'amber' && 'text-amber-400',
            !tone && 'text-muted-foreground',
          )}
        >
          {text}
        </span>
      )}
      <Badge asChild variant="secondary">
        <a href={link.url} target="_blank" rel="noreferrer" title={link.url}>
          {link.portal}
        </a>
      </Badge>
      {(link.fetchMode === 'browser' || runLink?.escalated) && (
        <Badge variant="outline" className="text-amber-400">
          browser
        </Badge>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${link.label}`}
        disabled={remove.isPending}
        onClick={() => remove.mutate({ data: link.id })}
        className="text-muted-foreground hover:text-destructive"
      >
        <X />
      </Button>
    </li>
  )
}
