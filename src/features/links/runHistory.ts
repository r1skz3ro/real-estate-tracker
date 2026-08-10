import { linkError } from '@/lib/format'
import type { Link, LinkRun, LinkStats } from './types'

export type RunOutcome = {
  text: string
  tone: 'red' | 'amber' | null
}

// Written by the baseline branch of `@/server/services/runs.ts`. Counters cannot tell a baseline
// from a quiet run — both are all-zero — and the log is the only place the difference survives.
// Same bargain as `linkError()`: a string contract between server and UI, held up by this test.
const BASELINE_PREFIX = 'baseline:'

export function isBaselineRun(run: LinkRun): boolean {
  return (run.log ?? []).some((line) => line.msg.startsWith(BASELINE_PREFIX))
}

// One line per fetch in the history: what it did, and how loudly to say it.
export function runOutcome(run: LinkRun): RunOutcome {
  if (run.status === 'pending') return { text: 'waiting', tone: null }
  if (run.status === 'running') return { text: 'fetching…', tone: null }

  if (run.status === 'error') {
    const error = linkError(run.error)
    return { text: error?.text ?? 'refresh failed', tone: error?.tone ?? 'red' }
  }

  if (isBaselineRun(run))
    return { text: `initial fetch · ${run.parsedCount} recorded`, tone: null }

  const changed = run.newCount + run.priceCount + run.removedCount
  if (changed === 0)
    return { text: `no changes · ${run.parsedCount} checked`, tone: null }

  return {
    text: `${run.newCount} new · ${run.priceCount} price · ${run.removedCount} removed`,
    tone: null,
  }
}

export function runDuration(run: LinkRun): string | null {
  if (!run.startedAt || !run.finishedAt) return null
  const ms =
    new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// A link whose baseline has landed but which has never produced an event has only ever done its
// first fetch — so its listings are the baseline, not news, and the page has to say so.
export function isInitialFetch(
  link: Link,
  stats: LinkStats | undefined,
): boolean {
  return link.baselinedAt !== null && stats?.events === 0
}

const TIME = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Warsaw',
})

// Pinned to Warsaw for the same reason as fmtWhen: the server renders this too.
export const fmtLogTime = (at: number) => TIME.format(new Date(at))
