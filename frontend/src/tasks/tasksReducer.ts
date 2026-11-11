import type { ApiError, Page, Task } from '../api/types.ts'

export const DEFAULT_PAGE_SIZE = 20
export const MIN_PAGE_SIZE = 1
export const MAX_PAGE_SIZE = 100

export interface TasksState {
  status: 'loading' | 'ready' | 'error'
  /** Page and size of the latest request (or of the applied response when ready). */
  page: number
  size: number
  /** Last applied response; kept while a newer request is loading. */
  data: Page<Task> | null
  error: ApiError | null
  /** Id of the latest request. Results carrying any other id are ignored (latest wins). */
  requestId: number
  /**
   * Tasks saved (PATCH 200) while the latest request is loading. That request may have been read
   * before the save, so its response is re-merged with these. Cleared by every new request: a
   * request issued after the save already sees it.
   */
  savedSince: Readonly<Record<number, Task>>
}

export type TasksAction =
  | { type: 'requested'; id: number; page: number; size: number }
  | { type: 'succeeded'; id: number; data: Page<Task> }
  | { type: 'failed'; id: number; error: ApiError }
  /** A server-confirmed task (PATCH 200) replaces the row with the same id in the current data. */
  | { type: 'taskUpdated'; task: Task }

/** Initial state. A seed (the login probe page) is used as is, with no request. */
export function initialTasksState(seed: Page<Task> | null): TasksState {
  if (seed === null) {
    return { status: 'loading', page: 0, size: DEFAULT_PAGE_SIZE, data: null, error: null, requestId: 0, savedSince: {} }
  }
  return { status: 'ready', page: seed.page, size: seed.size, data: seed, error: null, requestId: 0, savedSince: {} }
}

export function tasksReducer(state: TasksState, action: TasksAction): TasksState {
  switch (action.type) {
    case 'requested':
      return { ...state, status: 'loading', page: action.page, size: action.size, error: null, requestId: action.id, savedSince: {} }
    case 'succeeded':
      if (action.id !== state.requestId) return state
      return {
        ...state,
        status: 'ready',
        page: action.data.page,
        size: action.data.size,
        data: withSaved(action.data, state.savedSince),
        error: null,
        savedSince: {},
      }
    case 'failed':
      if (action.id !== state.requestId) return state
      if (action.error.kind === 'aborted') return state
      return { ...state, status: 'error', error: action.error }
    case 'taskUpdated': {
      const savedSince =
        state.status === 'loading' ? { ...state.savedSince, [action.task.id]: action.task } : state.savedSince
      const data = state.data
      if (data === null || !data.content.some((t) => t.id === action.task.id)) return savedSince === state.savedSince ? state : { ...state, savedSince }
      return {
        ...state,
        savedSince,
        data: { ...data, content: data.content.map((t) => (t.id === action.task.id ? action.task : t)) },
      }
    }
  }
}

/** Replaces rows of `data` that were saved after the request was issued (the response may predate them). */
function withSaved(data: Page<Task>, saved: Readonly<Record<number, Task>>): Page<Task> {
  if (!data.content.some((t) => saved[t.id] !== undefined)) return data
  return { ...data, content: data.content.map((t) => saved[t.id] ?? t) }
}

/** A page size is valid when it is an integer from 1 to 100. */
export function isValidPageSize(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PAGE_SIZE && value <= MAX_PAGE_SIZE
}

/** Page to load after an empty response for `page` > 0: min(page - 1, totalPages - 1), at least 0. */
export function clampTarget(page: number, totalPages: number): number {
  return Math.max(0, Math.min(page - 1, totalPages - 1))
}

/** Page that would hold a newly created task, from the same applied response's size and total. */
export function lastPageAfterCreate(totalElements: number, size: number): number {
  return Math.max(Math.ceil((totalElements + 1) / size) - 1, 0)
}
