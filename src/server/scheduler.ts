import cron from 'node-cron'
import { listProjects, pruneRuns, updateProject } from '#/db/queries'
import { runProject } from './run'
import type { projects } from '#/db/schema'

type Project = Pick<
  typeof projects.$inferSelect,
  'id' | 'runAt1' | 'runAt2' | 'lastScheduledAt'
>

// Plain process env rather than a .env loader: vite does not put .env into process.env for the
// server runtime anyway, and `SCHEDULER_ENABLED=false pnpm dev` is the whole requirement — no
// background Chromium launching mid-edit.
const TICK_MINUTES = Number(process.env.SCHEDULER_TICK_MINUTES ?? 30)
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 90)
const ENABLED = process.env.SCHEDULER_ENABLED !== 'false' && !process.env.VITEST

// 'sv-SE' renders "2026-08-06 20:15" — ISO-ordered, so both halves compare as plain strings and no
// timezone offset arithmetic (or date library) is needed anywhere below.
const WARSAW = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Warsaw',
  dateStyle: 'short',
  timeStyle: 'short',
})

function warsaw(date: Date): [day: string, time: string] {
  const [day = '', time = ''] = WARSAW.format(date).split(' ')
  return [day, time]
}

// A slot is due once its HH:MM has passed in Warsaw and lastScheduledAt does not already cover it.
// Comparing wall-clock times instead of registering cron entries is what makes catch-up free: a
// laptop asleep through 08:00 wakes with lastDay !== today, so the slot is still due. Both slots
// overdue collapses into one run — the current state of the portals is what's wanted, not two runs
// 30 seconds apart.
export function isDue(project: Project, now = new Date()): boolean {
  const [today, time] = warsaw(now)
  const [lastDay, lastTime] = project.lastScheduledAt
    ? warsaw(project.lastScheduledAt)
    : ['', '']

  return [project.runAt1, project.runAt2].some(
    (slot) => slot <= time && !(lastDay === today && lastTime >= slot),
  )
}

function tick() {
  for (const project of listProjects()) {
    if (!isDue(project)) continue
    // Stamped before the run starts, so a tick landing mid-run cannot re-fire the same slot.
    updateProject(project.id, { lastScheduledAt: new Date() })
    // startRun already swallows rejections on the fire-and-forget path.
    void runProject(project.id, 'scheduled')
    // ponytail: one project per tick, so projects sharing a refresh time spread out over ticks
    // instead of queueing every link against the same portal in one serial burst. Drop the break if
    // a project ever needs its slot honoured to the minute.
    break
  }
}

// Vite re-executes the server entry on HMR; without the flag every reload stacks another pair of
// cron jobs onto the same process.
const started = Symbol.for('estate-tracker.scheduler')
type Flagged = typeof globalThis & { [started]?: true }

export function startScheduler() {
  const global = globalThis as Flagged
  if (!ENABLED || global[started]) return
  global[started] = true

  // Booting at 09:00 after the 08:00 slot passed has to produce a run immediately — this is the
  // behaviour the whole always-on-app model rests on.
  tick()
  cron.schedule(`*/${TICK_MINUTES} * * * *`, tick)
  cron.schedule('0 4 * * *', () => pruneRuns(RETENTION_DAYS), {
    timezone: 'Europe/Warsaw',
  })
}
