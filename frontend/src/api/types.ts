export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']

export interface Task {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

export interface Page<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** Form values for create and edit. `description` is the raw text; empty means "none". */
export interface TaskDraft {
  title: string
  description: string
  status: TaskStatus
}

/** Body of POST /api/tasks. `description` is omitted when empty. */
export interface TaskCreateBody {
  title: string
  description?: string
  status?: TaskStatus
}

/** Body of PATCH /api/tasks/{id}: changed fields only. `description: null` clears it. */
export interface TaskPatch {
  title?: string
  description?: string | null
  status?: TaskStatus
}

export interface Credentials {
  username: string
  password: string
}

export interface ProblemFieldError {
  field: string
  message: string
}

/** Subset of the backend's application/problem+json body that the client reads. */
export interface ProblemBody {
  title?: string
  detail?: string
  status?: number
  errors?: ProblemFieldError[]
}

export type ApiError =
  | { kind: 'unauthorized' }
  | { kind: 'validation'; detail?: string; fieldErrors: Record<string, string[]>; general: string[] }
  | { kind: 'notFound' }
  | { kind: 'server' }
  | { kind: 'network' }
  | { kind: 'aborted' }

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError }
