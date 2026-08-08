import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { fmtArea, fmtPerM2, fmtPrice } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isPriceDrop } from './summarize'
import type { FindingEvent } from './types'

export function EventCard({ event }: { event: FindingEvent }) {
  const unread = event.readAt === null
  const removed = event.type === 'removed'

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
              isPriceDrop(event) ? 'text-emerald-500' : 'text-red-400',
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
