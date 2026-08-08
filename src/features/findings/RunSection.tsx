import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { fmtWhen } from '@/lib/format'
import { EventCard } from './EventCard'
import { countsLabel, hasUnread } from './summarize'
import { useAutoRead } from './useAutoRead'
import type { FindingsRun } from './types'

export function RunSection({
  run,
  onRead,
  pending,
}: {
  run: FindingsRun
  onRead: (vars: { data: number }) => void
  pending: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const unread = hasUnread(run.events)
  const read = useCallback(() => onRead({ data: run.id }), [onRead, run.id])

  useAutoRead(ref, unread, read)

  if (run.events.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {fmtWhen(run.startedAt)} ·{' '}
        {run.status === 'failed' ? 'failed' : 'no changes'}
      </p>
    )

  return (
    <section ref={ref} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium tabular-nums">
          {fmtWhen(run.startedAt)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {countsLabel(run.events)}
        </span>
        {unread && (
          <Button
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={read}
            className="ms-auto text-muted-foreground"
          >
            Mark all read
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {run.events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    </section>
  )
}
