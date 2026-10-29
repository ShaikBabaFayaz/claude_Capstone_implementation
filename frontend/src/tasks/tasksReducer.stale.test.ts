import { describe, expect, it } from 'vitest'
import type { Page, Task } from '../api/types.ts'
import { makeTasks, pageOf } from '../test/handlers.ts'
import { initialTasksState, tasksReducer } from './tasksReducer.ts'

const page = (n: number): Page<Task> => pageOf(makeTasks(n), 0, 10)

describe('taskUpdated while a list request is in flight', () => {
  const old = page(3)
  const saved = { ...old.content[1], title: 'Saved', status: 'DONE' as const }

  function loadingWithSave() {
    let state = tasksReducer(initialTasksState(old), { type: 'requested', id: 1, page: 0, size: 10 })
    state = tasksReducer(state, { type: 'taskUpdated', task: saved })
    return state
  }

  it('re-applies the saved task when the older response arrives', () => {
    const next = tasksReducer(loadingWithSave(), { type: 'succeeded', id: 1, data: old })
    expect(next.status).toBe('ready')
    expect(next.data?.content[1]).toEqual(saved)
    expect(next.data?.content[0]).toBe(old.content[0])
    expect(next.savedSince).toEqual({})
  })

  it('does not insert a saved task that is not in the response page', () => {
    const next = tasksReducer(loadingWithSave(), { type: 'succeeded', id: 1, data: page(1) })
    expect(next.data?.content).toEqual(page(1).content)
  })

  it('forgets saves once a newer request starts (that request already sees them)', () => {
    let state = loadingWithSave()
    state = tasksReducer(state, { type: 'requested', id: 2, page: 0, size: 10 })
    expect(state.savedSince).toEqual({})
    const fresh = page(3)
    expect(tasksReducer(state, { type: 'succeeded', id: 2, data: fresh }).data).toBe(fresh)
  })

  it('records nothing when no request is in flight', () => {
    const state = tasksReducer(initialTasksState(old), { type: 'taskUpdated', task: saved })
    expect(state.savedSince).toEqual({})
  })
})
