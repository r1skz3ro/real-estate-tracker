import { fmtWhen, linkError } from '@/lib/format'
import type { Link } from './types'
import type { RunLink, RunStatus } from '@/features/runs/types'

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-muted-foreground/40',
  running: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-500',
  error: 'bg-red-500',
}

export type LinkState = {
  status: string
  dot: string
  text: string | null
  title: string | null
  tone: 'red' | 'amber' | null
}

// Only the fields these two functions actually read. The project page passes a row from the run
// poll and the link page one from the link's own history — same columns, different joins.
export type RunLinkView = Pick<
  RunLink,
  | 'status'
  | 'error'
  | 'parsedCount'
  | 'newCount'
  | 'priceCount'
  | 'removedCount'
> & { baselinedAt?: Date | null }

// What the row says and how loud it says it. The raw reason stays as the tooltip — the friendly
// wording is for reading, the category detail is for debugging.
export function linkState(
  link: Link,
  runLink: RunLinkView | undefined,
  startedAt: RunStatus['run']['startedAt'] | undefined,
): LinkState {
  const status = runLink?.status ?? link.status
  const reason = runLink ? runLink.error : link.lastError
  const error = status === 'error' ? linkError(reason) : null

  const dot = error
    ? error.tone === 'amber'
      ? 'bg-amber-500'
      : 'bg-red-500'
    : (STATUS_DOT[status] ?? STATUS_DOT.pending!)

  if (error)
    return { status, dot, text: error.text, title: reason, tone: error.tone }

  const text =
    runLink && startedAt
      ? runSummary(runLink, startedAt)
      : status === 'ok' && link.lastRunAt
        ? `last checked ${fmtWhen(link.lastRunAt)}`
        : null

  return { status, dot, text, title: text, tone: null }
}

export function runSummary(
  runLink: RunLinkView,
  startedAt: RunStatus['run']['startedAt'],
): string {
  if (runLink.status === 'pending') return 'waiting'
  if (runLink.status === 'running') return 'fetching…'
  // Baselined during this run — a first run reports what it seeded, not zero news.
  if (
    runLink.baselinedAt &&
    new Date(runLink.baselinedAt) >= new Date(startedAt)
  )
    return `baseline: ${runLink.parsedCount}`
  return `${runLink.newCount} new · ${runLink.priceCount} price · ${runLink.removedCount} removed`
}
