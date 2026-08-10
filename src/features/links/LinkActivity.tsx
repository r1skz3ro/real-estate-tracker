import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fmtWhen } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fmtLogTime, runDuration, runOutcome } from './runHistory'
import type { LinkRun } from './types'
import type { LinkRunPlane } from './useLinkRun'

export function LinkActivity({ run }: { run: LinkRunPlane }) {
  if (run.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>
  if (run.error)
    return <p className="text-sm text-destructive">{run.error.message}</p>
  if (run.runs.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No fetches yet — refresh to give this link a baseline.
      </p>
    )

  return (
    <ul className="divide-y divide-border">
      {run.runs.map((entry, i) => (
        // The newest fetch is the one being watched, so it starts open and the rest stay folded.
        <RunEntry key={entry.id} entry={entry} defaultOpen={i === 0} />
      ))}
    </ul>
  )
}

function RunEntry({
  entry,
  defaultOpen,
}: {
  entry: LinkRun
  defaultOpen: boolean
}) {
  const outcome = runOutcome(entry)
  const duration = runDuration(entry)
  const log = entry.log ?? []

  return (
    <li>
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-accent/30">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span className="shrink-0 tabular-nums">
            {fmtWhen(entry.runStartedAt)}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              outcome.tone === 'red' && 'text-destructive',
              outcome.tone === 'amber' && 'text-amber-400',
              !outcome.tone && 'text-muted-foreground',
            )}
            title={entry.error ?? undefined}
          >
            {outcome.text}
          </span>
          {entry.escalated && (
            <Badge variant="outline" className="text-amber-400">
              browser
            </Badge>
          )}
          {duration && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {duration}
            </span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          {log.length === 0 ? (
            <p className="px-5 pb-3 text-xs text-muted-foreground">
              No log for this fetch.
            </p>
          ) : (
            <ScrollArea className="max-h-72 px-5 pb-3">
              <ol className="space-y-0.5 font-mono text-xs">
                {log.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {fmtLogTime(line.at)}
                    </span>
                    {/* Long URLs must wrap rather than push the panel sideways. */}
                    <span className="min-w-0 break-all">{line.msg}</span>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
