import { expect, test } from 'vitest'
import { projectState } from './projectState'
import type { ProjectRun, ProjectSummary } from './types'

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: 1,
  name: 'Wrocław działki',
  description: null,
  archivedAt: null,
  createdAt: new Date(),
  unread: 0,
  failing: 0,
  lastRunAt: null,
  ...over,
})

const run = (over: Partial<ProjectRun> = {}): ProjectRun => ({
  projectId: 1,
  total: 4,
  done: 0,
  fetching: 0,
  ...over,
})

test('a project waiting its turn is not the same as one on the wire', () => {
  expect(projectState(project(), run())).toMatchObject({ text: 'queued' })
  expect(projectState(project(), run({ done: 1, fetching: 1 }))).toMatchObject({
    text: 'fetching 2/4',
    dot: 'bg-amber-400 animate-pulse',
  })
})

test('the live run beats the stored counts it has already made stale', () => {
  expect(
    projectState(project({ failing: 3, lastRunAt: 1 }), run({ fetching: 1 })),
  ).toMatchObject({ text: 'fetching 1/4' })
})

test('a failing link is amber from the nav, whatever its category', () => {
  expect(projectState(project({ failing: 1 }), undefined)).toMatchObject({
    text: '1 link failing',
    tone: 'amber',
  })
  expect(projectState(project({ failing: 3 }), undefined)).toMatchObject({
    text: '3 links failing',
  })
})

test('never checked and checked are told apart by lastRunAt, not by the run', () => {
  expect(projectState(project(), undefined)).toMatchObject({
    text: 'never checked',
  })
  expect(
    projectState(
      project({ lastRunAt: Date.parse('2026-08-09T14:01:00Z') }),
      undefined,
    ),
  ).toMatchObject({ text: 'checked 9 sie, 16:01', dot: 'bg-emerald-500' })
})
