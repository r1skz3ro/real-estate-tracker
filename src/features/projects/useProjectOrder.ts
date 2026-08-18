import { useEffect, useMemo, useState } from 'react'
import { applyOrder } from './order'
import type { ProjectSummary } from './types'

const KEY = 'project-order'

function read(): Array<number> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(stored) && stored.every((id) => typeof id === 'number')
      ? stored
      : []
  } catch {
    return []
  }
}

// ponytail: the order is per-browser and goes with the storage. A projects.sortOrder column is the
// upgrade path if it ever needs to follow the user to another machine.
export function useProjectOrder(projects: Array<ProjectSummary>) {
  // Empty on the first render rather than read during it: the server has no localStorage, and a
  // client render that disagrees with the server's is a hydration mismatch.
  const [order, setOrder] = useState<Array<number>>([])
  useEffect(() => setOrder(read()), [])

  return {
    ordered: useMemo(() => applyOrder(projects, order), [projects, order]),
    reorder: (next: Array<number>) => {
      setOrder(next)
      localStorage.setItem(KEY, JSON.stringify(next))
    },
  }
}
