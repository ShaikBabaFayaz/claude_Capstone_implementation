import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ApiClient } from '../api/client.ts'
import type { Page, Task } from '../api/types.ts'
import {
  clampTarget,
  initialTasksState,
  isValidPageSize,
  lastPageAfterCreate,
  tasksReducer,
  type TasksState,
} from './tasksReducer.ts'

export interface UseTasks extends TasksState {
  /** Loads another page at the current size. Ignores a negative or non-integer page. */
  setPage: (page: number) => void
  /** Sets the page size and resets to page 0. Returns false (and sends nothing) for 0, 101, non-integers. */
  setSize: (size: number) => boolean
  /** Reloads the current page (retry, after delete or a 404). */
  refetch: () => void
  /** One GET for the page that holds a newly created task, from the applied response's size and total. */
  goToLastPage: () => void
  /** Shows a server-confirmed task (PATCH 200) in the current list data, whatever happened meanwhile. */
  taskUpdated: (task: Task) => void
}

/**
 * List state. `seed` (the login probe page) is read once for the initial state: no mount GET.
 * Without a seed the first page is loaded on mount.
 */
export function useTasks(client: ApiClient, seed: Page<Task> | null): UseTasks {
  const [state, dispatch] = useReducer(tasksReducer, seed, initialTasksState)
  const [seeded] = useState(() => seed !== null)

  const latestId = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const applied = useRef<Page<Task> | null>(seed)
  const view = useRef({ page: state.page, size: state.size })

  const load = useCallback(
    function load(page: number, size: number): void {
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      latestId.current += 1
      const id = latestId.current
      view.current = { page, size }
      dispatch({ type: 'requested', id, page, size })

      void client.listTasks(page, size, { signal: abort.signal }).then((result) => {
        if (id !== latestId.current) return // a newer request or unmount: ignore
        if (!result.ok) {
          if (result.error.kind !== 'aborted') dispatch({ type: 'failed', id, error: result.error })
          return
        }
        const data = result.value
        if (data.content.length === 0 && data.page > 0) {
          // Out of range (deleted elsewhere, or a too-high guess): step down, strictly decreasing.
          load(clampTarget(data.page, data.totalPages), size)
          return
        }
        applied.current = data
        view.current = { page: data.page, size: data.size }
        dispatch({ type: 'succeeded', id, data })
      })
    },
    [client],
  )

  useEffect(() => {
    if (!seeded) load(0, view.current.size)
    return () => {
      latestId.current += 1 // late results of this mount are ignored
      controller.current?.abort()
    }
  }, [load, seeded])

  const setPage = useCallback(
    (page: number) => {
      if (!Number.isInteger(page) || page < 0) return
      load(page, view.current.size)
    },
    [load],
  )

  const setSize = useCallback(
    (size: number) => {
      if (!isValidPageSize(size)) return false
      load(0, size)
      return true
    },
    [load],
  )

  const refetch = useCallback(() => {
    load(view.current.page, view.current.size)
  }, [load])

  const goToLastPage = useCallback(() => {
    const current = applied.current
    if (current === null) {
      load(view.current.page, view.current.size)
      return
    }
    load(lastPageAfterCreate(current.totalElements, current.size), current.size)
  }, [load])

  const taskUpdated = useCallback((task: Task) => {
    dispatch({ type: 'taskUpdated', task })
  }, [])

  return { ...state, setPage, setSize, refetch, goToLastPage, taskUpdated }
}
