# Phase 07 — Run orchestration

**Goal:** wire fetch → parse → diff → persist into one background job with live per-link progress.
First phase where the app actually does its job.

## `src/server/run.ts`

```ts
export async function runProject(projectId: number, trigger: 'manual' | 'scheduled'): Promise<void>
```

### 1. Set up visibly, before any network call

Insert the `runs` row and a `runLinks` row per link **upfront**, all `pending`. The UI can then render
the full checklist immediately instead of items appearing one by one out of nowhere.

### 2. Walk links sequentially

Never in parallel — see the politeness rules. For each link:

1. mark its `runLinks` row `running`
2. `fetchPage(link, url)` (phase 04)
3. parse with that portal's parser (phase 05)
4. **verdict check**: `listings.length === 0 && !emptyState` → treat as broken. If the fetch was
   HTTP, escalate to browser once and retry from step 2; if it was already the browser, fail the link
   with `parse-broken`
5. page-2 decision (phase 06 rule 4), with a 3–8s gap before fetching it
6. if `baselinedAt` is null → insert all listings, set `baselinedAt`, emit no events,
   `parsedCount = N`
7. otherwise `diff()` → insert `added` listings + `new` events, update prices + `price` events,
   `verifyRemoved()` each candidate → set `removedAt` + `removed` events
8. update `lastSeenAt`/`lastRank` for everything present
9. finish the `runLinks` row with counts, set `link.status = 'ok'`, clear `lastError`

### 3. Contain failures

Wrap each link in its own try/catch. **One dead portal must never abort the run.** On failure: that
`runLinks` row goes `error` with the reason, `link.status = 'error'`, `link.lastError` set — and the
loop continues to the next link.

Categorise the error so phase 10 can render it usefully: `blocked`, `parse-broken`, `timeout`,
`network`, `unknown`.

### 4. Always clean up

```ts
try { ...links... } finally { await closeBrowser(); await finishRun(runId) }
```

A leaked Chromium process on every run will eat the machine. The `runs` row must reach a terminal
status even if something throws, or the UI polls a phantom "running" job forever.

Run status: `done` if any link succeeded, `failed` only if every link failed.

### 5. notify seam

At the very end, one call with the run summary. Leave it as a no-op plus a comment — email/Telegram
are wanted later, and one call site is the whole abstraction needed until a second channel exists.

## Server functions (`src/server/runs.ts`)

- `startRunFn({ projectId })` — kicks off `runProject` **without awaiting it** and returns the new
  `runId` immediately. The global mutex from phase 04 means a second click queues rather than
  double-runs; return the in-flight run's id if one is already active for that project.
- `getRunStatusFn({ runId })` — the run row plus its `runLinks` joined to link labels.

## UI

Refresh button on the project page. While a run is active, poll `getRunStatusFn` with TanStack Query
`refetchInterval: 1500`, stopping when the run reaches a terminal status, then invalidate the
findings query.

Per link show: label, portal, status (pending / running / ok / error), and once done
`N new · N price · N removed`, or `baseline: N` on the first run, or the error reason. Mark escalated
links so it is visible when a portal started needing the browser.

Expect 1–2 minutes for a 10-link project — that is the jitter working as designed, not a hang.

## Done when

- A manual refresh of the real 5-link Sulistrowice project completes; each link reports
  `baseline: N` with N > 0, all green, zero events.
- The OLX link shows browser mode; the other four stay on HTTP.
- A second refresh minutes later: all green, 0 new, 0 removed. **This is the key check** — it proves
  the seen-set works and that a quiet run is not mistaken for a broken one.
- Break one link's URL to a 404 path: that link goes red with a reason, the other four still succeed.
- No `chromium` processes remain after a run (`pgrep -f chromium`).
