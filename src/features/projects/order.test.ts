import { expect, test } from 'vitest'
import { applyOrder } from './order'

const ids = (projects: Array<{ id: number }>) => projects.map((p) => p.id)
const projects = [{ id: 1 }, { id: 2 }, { id: 3 }]

test('a stored order wins over the loader order', () => {
  expect(ids(applyOrder(projects, [3, 1, 2]))).toEqual([3, 1, 2])
})

test('no stored order leaves the loader order alone', () => {
  expect(ids(applyOrder(projects, []))).toEqual([1, 2, 3])
})

test('projects created since the last drag land at the end, in loader order', () => {
  expect(ids(applyOrder([...projects, { id: 4 }, { id: 5 }], [3, 1]))).toEqual([
    3, 1, 2, 4, 5,
  ])
})

test('a deleted project left in the stored order drops nothing', () => {
  expect(ids(applyOrder(projects, [9, 3, 2, 1]))).toEqual([3, 2, 1])
})
