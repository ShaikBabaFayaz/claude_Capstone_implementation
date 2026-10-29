import { describe, expect, it } from 'vitest'
import type { Page, Task } from '../api/types.ts'
import { makeTasks, pageOf } from '../test/handlers.ts'
import {
  clampTarget,
  DEFAULT_PAGE_SIZE,
  initialTasksState,
  isValidPageSize,
  lastPageAfterCreate,
  tasksReducer,
} from './tasksReducer.ts'

const page = (n: number, p = 0, size = 10): Page<Task> => pageOf(makeTasks(n), p, size)

describe('initialTasksState', () => {
  it('starts loading with the default size when there is no seed', () => {
    expect(initialTasksState(null)).toMatchObject({ status: 'loading', page: 0, size: DEFAULT_PAGE_SIZE, data: null })
  })

  it('is ready with the seed as is', () => {
    const seed = page(5, 0, 20)
    expect(initialTasksState(seed)).toMatchObject({ status: 'ready', data: seed, page: 0, size: 20, requestId: 0 })
  })
})

describe('tasksReducer', () => {
  it('marks loading and keeps the previous data while a request is pending', () => {
    const seed = page(5)
    const next = tasksReducer(initialTasksState(seed), { type: 'requested', id: 1, page: 2, size: 10 })
    expect(next).toMatchObject({ status: 'loading', page: 2, requestId: 1, data: seed })
  })

  it('applies only the result of the latest request id', () => {
    let state = initialTasksState(null)
    state = tasksReducer(state, { type: 'requested', id: 1, page: 0, size: 10 })
    state = tasksReducer(state, { type: 'requested', id: 2, page: 1, size: 10 })
    const stale = tasksReducer(state, { type: 'succeeded', id: 1, data: page(3, 0) })
    expect(stale).toBe(state)
    const fresh = tasksReducer(state, { type: 'succeeded', id: 2, data: page(30, 1) })
    expect(fresh).toMatchObject({ status: 'ready', page: 1 })
  })

  it('ignores a stale failure and an aborted failure', () => {
    let state = initialTasksState(null)
    state = tasksReducer(state, { type: 'requested', id: 2, page: 0, size: 10 })
    expect(tasksReducer(state, { type: 'failed', id: 1, error: { kind: 'server' } })).toBe(state)
    expect(tasksReducer(state, { type: 'failed', id: 2, error: { kind: 'aborted' } })).toBe(state)
  })

  it('moves to the error state on a current failure and clears it on the next request', () => {
    let state = initialTasksState(null)
    state = tasksReducer(state, { type: 'requested', id: 1, page: 0, size: 10 })
    state = tasksReducer(state, { type: 'failed', id: 1, error: { kind: 'server' } })
    expect(state).toMatchObject({ status: 'error', error: { kind: 'server' } })
    state = tasksReducer(state, { type: 'requested', id: 2, page: 0, size: 10 })
    expect(state).toMatchObject({ status: 'loading', error: null })
  })
})

describe('taskUpdated', () => {
  it('replaces the matching row in the current data and keeps everything else', () => {
    const seed = page(3)
    const state = initialTasksState(seed)
    const updated = { ...seed.content[1], status: 'DONE' as const }
    const next = tasksReducer(state, { type: 'taskUpdated', task: updated })
    expect(next.data?.content[1]).toEqual(updated)
    expect(next.data?.content[0]).toBe(seed.content[0])
    expect(next.data?.totalElements).toBe(seed.totalElements)
    expect(next.status).toBe('ready')
  })

  it('merges into the kept data while a newer request is loading', () => {
    const seed = page(3)
    let state = tasksReducer(initialTasksState(seed), { type: 'requested', id: 1, page: 0, size: 10 })
    const updated = { ...seed.content[0], title: 'Saved' }
    state = tasksReducer(state, { type: 'taskUpdated', task: updated })
    expect(state.status).toBe('loading')
    expect(state.data?.content[0].title).toBe('Saved')
  })

  it('ignores a task that is not in the current data', () => {
    const state = initialTasksState(page(2))
    const other = { ...makeTasks(1)[0], id: 9999 }
    expect(tasksReducer(state, { type: 'taskUpdated', task: other })).toBe(state)
    expect(tasksReducer(initialTasksState(null), { type: 'taskUpdated', task: other }).data).toBeNull()
  })
})

describe('page rules', () => {
  it('accepts sizes 1 to 100 as integers only', () => {
    for (const ok of [1, 20, 100]) expect(isValidPageSize(ok)).toBe(true)
    for (const bad of [0, 101, -1, 2.5, Number.NaN, Infinity]) expect(isValidPageSize(bad)).toBe(false)
  })

  it('clamps to min(page - 1, totalPages - 1), floored at 0', () => {
    expect(clampTarget(3, 3)).toBe(2)
    expect(clampTarget(7, 3)).toBe(2)
    expect(clampTarget(2, 5)).toBe(1)
    expect(clampTarget(1, 1)).toBe(0)
    expect(clampTarget(4, 0)).toBe(0) // empty list: totalPages 0
  })

  it('strictly decreases on every clamp step', () => {
    for (let p = 1; p < 10; p++) expect(clampTarget(p, 100)).toBeLessThan(p)
  })

  it('computes the post-create page as max(ceil((total + 1) / size) - 1, 0)', () => {
    expect(lastPageAfterCreate(0, 10)).toBe(0)
    expect(lastPageAfterCreate(9, 10)).toBe(0)
    expect(lastPageAfterCreate(10, 10)).toBe(1) // exact multiple: the new task starts a new page
    expect(lastPageAfterCreate(20, 10)).toBe(2)
    expect(lastPageAfterCreate(25, 10)).toBe(2)
  })
})
