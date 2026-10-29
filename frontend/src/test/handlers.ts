import { http, HttpResponse } from 'msw'
import { basicHeader } from '../auth/basicHeader.ts'
import type { Credentials, Page, Task, TaskStatus } from '../api/types.ts'

// Shared MSW handlers mirroring the backend contract. Absolute URLs because Node fetch rejects
// relative ones. Credentials are obviously dummy values.
export const API_BASE = 'http://localhost:8080/api'
export const TASKS_URL = `${API_BASE}/tasks`

export const TEST_CREDENTIALS: Credentials = { username: 'test-user', password: 'test-pass' }
export const VALID_AUTH_HEADER = basicHeader(TEST_CREDENTIALS)

/** Description length that the handlers reject with a suffixed field name on PATCH. */
export const MAX_DESCRIPTION = 2000
export const MAX_TITLE = 255

const PROBLEM_CONTENT_TYPE = 'application/problem+json'

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Task 1',
    description: null,
    status: 'TODO',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    ...overrides,
  }
}

export function makeTasks(count: number, firstId = 1): Task[] {
  return Array.from({ length: count }, (_, i) =>
    makeTask({ id: firstId + i, title: `Task ${firstId + i}` }),
  )
}

export function pageOf(tasks: Task[], page: number, size: number): Page<Task> {
  const totalElements = tasks.length
  return {
    content: tasks.slice(page * size, page * size + size),
    page,
    size,
    totalElements,
    totalPages: Math.ceil(totalElements / size),
  }
}

export function problemResponse(
  status: number,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {},
): Response {
  return HttpResponse.json(
    { type: 'about:blank', title, status, detail, ...extra },
    { status, headers: { 'content-type': PROBLEM_CONTENT_TYPE } },
  )
}

export function unauthorizedResponse(): Response {
  return problemResponse(401, 'Unauthorized', 'Authentication is required to access this resource.')
}

export function validationResponse(errors: { field: string; message: string }[]): Response {
  return problemResponse(400, 'Bad Request', 'Validation failed.', { errors })
}

// ---- in-memory store -------------------------------------------------------------------------
let tasks: Task[] = []
let nextId = 1

export function resetDb(initial: Task[] = []): void {
  tasks = initial.map((t) => ({ ...t }))
  nextId = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1
}

export function dbTasks(): Task[] {
  return tasks
}

resetDb()

function isStatus(value: unknown): value is TaskStatus {
  return value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE'
}

function authorised(request: Request): boolean {
  return request.headers.get('authorization') === VALID_AUTH_HEADER
}

function parseId(raw: string | readonly string[] | undefined): number {
  return Number(Array.isArray(raw) ? raw[0] : raw)
}

export const handlers = [
  http.get(TASKS_URL, ({ request }) => {
    if (!authorised(request)) return unauthorizedResponse()
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const errors: { field: string; message: string }[] = []
    if (!Number.isInteger(page) || page < 0) errors.push({ field: 'page', message: 'must be at least 0' })
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      errors.push({ field: 'size', message: 'must be between 1 and 100' })
    }
    if (errors.length > 0) return validationResponse(errors)
    return HttpResponse.json(pageOf(tasks, page, size))
  }),

  http.post(TASKS_URL, async ({ request }) => {
    if (!authorised(request)) return unauthorizedResponse()
    const body = (await request.json()) as Record<string, unknown>
    const errors: { field: string; message: string }[] = []
    const title = typeof body.title === 'string' ? body.title : ''
    if (title.trim() === '') errors.push({ field: 'title', message: 'must not be blank' })
    if (title.length > MAX_TITLE) errors.push({ field: 'title', message: 'size must be at most 255' })
    if (typeof body.description === 'string' && body.description.length > MAX_DESCRIPTION) {
      errors.push({ field: 'description', message: 'size must be at most 2000' })
    }
    if (errors.length > 0) return validationResponse(errors)
    if (body.status !== undefined && !isStatus(body.status)) {
      return problemResponse(
        400,
        'Bad Request',
        'Request body is missing, malformed or contains an invalid value.',
      )
    }
    const now = new Date().toISOString()
    const task: Task = {
      id: nextId,
      title,
      description: typeof body.description === 'string' ? body.description : null,
      status: isStatus(body.status) ? body.status : 'TODO',
      createdAt: now,
      updatedAt: now,
    }
    nextId += 1
    tasks.push(task)
    return HttpResponse.json(task, { status: 201, headers: { location: `${TASKS_URL}/${task.id}` } })
  }),

  http.patch(`${TASKS_URL}/:id`, async ({ request, params }) => {
    if (!authorised(request)) return unauthorizedResponse()
    const task = tasks.find((t) => t.id === parseId(params.id))
    if (!task) return problemResponse(404, 'Not Found', 'Task not found.')
    const body = (await request.json()) as Record<string, unknown>
    if (!('title' in body) && !('description' in body) && !('status' in body)) {
      return problemResponse(
        400,
        'Bad Request',
        'PATCH request must contain at least one of title, description, status.',
      )
    }
    const errors: { field: string; message: string }[] = []
    if ('title' in body && (typeof body.title !== 'string' || body.title.trim() === '')) {
      errors.push({ field: 'title', message: 'must not be blank' })
    }
    // A suffixed (container element) field name, as Optional-wrapped fields may produce.
    if (typeof body.description === 'string' && body.description.length > MAX_DESCRIPTION) {
      errors.push({ field: 'description.value', message: 'size must be at most 2000' })
    }
    if (errors.length > 0) return validationResponse(errors)
    if ('status' in body && !isStatus(body.status)) {
      return problemResponse(
        400,
        'Bad Request',
        'Request body is missing, malformed or contains an invalid value.',
      )
    }
    if (typeof body.title === 'string') task.title = body.title
    if ('description' in body) task.description = (body.description as string | null) ?? null
    if (isStatus(body.status)) task.status = body.status
    task.updatedAt = new Date().toISOString()
    return HttpResponse.json(task)
  }),

  http.delete(`${TASKS_URL}/:id`, ({ request, params }) => {
    if (!authorised(request)) return unauthorizedResponse()
    const index = tasks.findIndex((t) => t.id === parseId(params.id))
    if (index < 0) return problemResponse(404, 'Not Found', 'Task not found.')
    tasks.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]
