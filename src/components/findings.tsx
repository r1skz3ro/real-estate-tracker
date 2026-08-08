import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ImageOff } from 'lucide-react'
import { listFindingsFn, markAllReadFn, markReadFn } from '../server/findings'
import { fmtArea, fmtPerM2, fmtPrice, fmtWhen } from '../lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Findings = Awaited<ReturnType<typeof listFindingsFn>>
type Run = Findings['runs'][number]
type Event = Run['events'][number]

const PAGE = 20
const AUTO_READ_MS = 1000

const TYPES = ['all', 'new', 'price', 'removed'] as const
type TypeFilter = (typeof TYPES)[number]

export function Findings({ projectId }: { projectId: number }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [limit, setLimit] = useState(PAGE)
  const [type, setType] = useState<TypeFilter>('all')
  const [portal, setPortal] = useState('all')

  const findings = useQuery({
    queryKey: ['findings', projectId, limit],
    queryFn: () => listFindingsFn({ data: { projectId, limit } }),
  })

  // The sidebar badge comes from the root loader, not this query — both have to be refreshed.
  const refresh = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['findings', projectId] })
      await router.invalidate()
    },
  }
  const markRead = useMutation({ mutationFn: markReadFn, ...refresh })
  const markAll = useMutation({ mutationFn: markAllReadFn, ...refresh })

  const runs = findings.data?.runs ?? []
  const portals = [
    ...new Set(runs.flatMap((run) => run.events.map((e) => e.portal))),
  ].sort()
  const filtering = type !== 'all' || portal !== 'all'
  const unread = runs.some((run) => run.events.some((e) => e.readAt === null))

  const visible = runs
    .map((run) => ({
      ...run,
      events: run.events.filter(
        (e) =>
          (type === 'all' || e.type === type) &&
          (portal === 'all' || e.portal === portal),
      ),
    }))
    .filter((run) => !filtering || run.events.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Changes</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate({ data: projectId })}
          >
            Mark everything read
          </Button>
        </CardAction>
      </CardHeader>

      {portals.length > 0 && (
        <CardContent className="flex flex-wrap items-center gap-1">
          {TYPES.map((t) => (
            <Filter key={t} active={type === t} onClick={() => setType(t)}>
              {t}
            </Filter>
          ))}
          {portals.length > 1 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <Filter
                active={portal === 'all'}
                onClick={() => setPortal('all')}
              >
                all portals
              </Filter>
              {portals.map((p) => (
                <Filter
                  key={p}
                  active={portal === p}
                  onClick={() => setPortal(p)}
                >
                  {p}
                </Filter>
              ))}
            </>
          )}
        </CardContent>
      )}

      <CardContent className="space-y-4">
        {findings.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : findings.isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Could not load changes: {findings.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void findings.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtering
              ? 'Nothing matches those filters.'
              : 'No changes yet — refresh to set a baseline.'}
          </p>
        ) : (
          visible.map((run) => (
            <RunSection
              key={run.id}
              run={run}
              onRead={markRead.mutate}
              pending={markRead.isPending}
            />
          ))
        )}

        {findings.data?.hasMore && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLimit((l) => l + PAGE)}
          >
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

function RunSection({
  run,
  onRead,
  pending,
}: {
  run: Run
  onRead: (vars: { data: number }) => void
  pending: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const hasUnread = run.events.some((e) => e.readAt === null)
  const read = useCallback(() => onRead({ data: run.id }), [onRead, run.id])

  useAutoRead(ref, hasUnread, read)

  const totals = (['new', 'price', 'removed'] as const)
    .map((t) => `${run.events.filter((e) => e.type === t).length} ${t}`)
    .join(' · ')

  if (run.events.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {fmtWhen(run.startedAt)} · {run.trigger} ·{' '}
        {run.status === 'failed' ? 'failed' : 'no changes'}
      </p>
    )

  return (
    <section ref={ref} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium tabular-nums">
          {fmtWhen(run.startedAt)}
        </span>
        <Badge variant="secondary">{run.trigger}</Badge>
        <span className="text-sm text-muted-foreground tabular-nums">
          {totals}
        </span>
        {hasUnread && (
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

// Native IntersectionObserver — armed only while the section still has unread events, so it tears
// itself down once the invalidated query comes back read.
function useAutoRead(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onRead: () => void,
) {
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting)
        timer = setTimeout(() => {
          if (done.current) return
          done.current = true
          onRead()
        }, AUTO_READ_MS)
      else clearTimeout(timer)
    })
    observer.observe(el)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ref, active, onRead])
}

function EventCard({ event }: { event: Event }) {
  const unread = event.readAt === null
  const removed = event.type === 'removed'
  const drop =
    event.oldPrice !== null &&
    event.newPrice !== null &&
    event.newPrice < event.oldPrice

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex gap-3 rounded-lg border border-l-2 border-border p-2 transition-colors hover:bg-accent/30',
        unread ? 'border-l-primary bg-accent/20' : 'border-l-border',
        removed && 'opacity-60',
      )}
    >
      <Thumb src={event.imageUrl} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm font-medium',
              removed && 'line-through',
            )}
          >
            {event.title}
          </span>
          <Badge variant="secondary">{event.portal}</Badge>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {fmtPrice(event.price)} · {fmtArea(event.areaM2)} ·{' '}
          {fmtPerM2(event.pricePerM2)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {event.location ?? '—'}
        </p>
        {event.type === 'price' && (
          <p
            className={cn(
              'text-sm font-medium tabular-nums',
              drop ? 'text-emerald-500' : 'text-red-400',
            )}
          >
            {fmtPrice(event.oldPrice)} → {fmtPrice(event.newPrice)}
          </p>
        )}
        {removed && <p className="text-xs text-amber-400">no longer listed</p>}
      </div>
    </a>
  )
}

// Portal thumbnails are hotlinked; some portals reject the referer, so a failure is expected and
// falls back rather than being retried or proxied.
function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed)
    return (
      <div className="flex size-20 shrink-0 items-center justify-center rounded-md bg-muted">
        <ImageOff className="size-5 text-muted-foreground" />
      </div>
    )

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-20 shrink-0 rounded-md object-cover"
    />
  )
}
