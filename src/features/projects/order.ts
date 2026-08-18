// The loader hands projects back in createdAt order; a stored id list is the drag order laid over
// it. Ids the list doesn't mention (a project created after the last drag) rank last and keep their
// loader order among themselves; ids of projects that are gone are simply never looked up.
export function applyOrder<T extends { id: number }>(
  projects: Array<T>,
  order: Array<number>,
): Array<T> {
  const rank = new Map(order.map((id, i) => [id, i]))
  const at = (id: number) => rank.get(id) ?? order.length
  // Never Infinity - Infinity: a NaN comparator makes sort's result implementation-defined.
  return [...projects].sort((a, b) => at(a.id) - at(b.id))
}
