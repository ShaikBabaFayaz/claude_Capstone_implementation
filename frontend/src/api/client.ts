import { basicHeader } from '../auth/basicHeader.ts'
import { errorFromException, errorFromResponse } from './errors.ts'
import type {
  ApiError,
  Credentials,
  Page,
  Result,
  Task,
  TaskCreateBody,
  TaskPatch,
} from './types.ts'

export interface ApiClientOptions {
  /** Default '/api'. Tests pass an absolute URL because Node fetch rejects relative ones. */
  baseUrl?: string
  /** Returns the current `Authorization` header, or null when no credentials are held. */
  getAuthHeader: () => string | null
  /** Called once for a 401 on a regular call of the current session while credentials are held. */
  onUnauthorized: () => void
}

export interface RequestOptions {
  signal?: AbortSignal
}

export interface ApiClient {
  listTasks(page: number, size: number, options?: RequestOptions): Promise<Result<Page<Task>>>
  createTask(body: TaskCreateBody, options?: RequestOptions): Promise<Result<Task>>
  patchTask(id: number, patch: TaskPatch, options?: RequestOptions): Promise<Result<Task>>
  deleteTask(id: number, options?: RequestOptions): Promise<Result<void>>
  /** Login check: builds its own header, commits nothing, never calls onUnauthorized. */
  probe(credentials: Credentials): Promise<Result<Page<Task>>>
  /** Aborts every pending request and starts a new session. */
  abortAll(): void
}

const PROBE_PAGE = 0
const PROBE_SIZE = 20

const aborted: ApiError = { kind: 'aborted' }
const server: ApiError = { kind: 'server' }

function isPage(value: unknown): value is Page<Task> {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.content) &&
    typeof v.page === 'number' &&
    typeof v.size === 'number' &&
    typeof v.totalElements === 'number' &&
    typeof v.totalPages === 'number'
  )
}

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'number' && typeof v.title === 'string' && typeof v.status === 'string'
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/+$/, '')
  let session = new AbortController()
  let sessionId = 0

  interface Call<T> {
    path: string
    method: string
    /** Header to send; for regular calls read lazily from getAuthHeader. */
    header: string | null
    regular: boolean
    body?: unknown
    signal?: AbortSignal
    parse: (response: Response) => Promise<Result<T>>
  }

  async function execute<T>(call: Call<T>): Promise<Result<T>> {
    const startedSession = sessionId
    const sessionSignal = session.signal
    const current = () => sessionId === startedSession

    // Per-request controller linked to the session signal and the caller's signal.
    // Manual link (not AbortSignal.any) so listeners are removed on completion; see the listener cleanup test in client.test.ts.
    const controller = new AbortController()
    const sources = [sessionSignal, call.signal].filter((s): s is AbortSignal => s !== undefined)
    const onAbort = () => controller.abort()
    for (const source of sources) {
      if (source.aborted) controller.abort()
      else source.addEventListener('abort', onAbort, { once: true })
    }

    try {
      const headers: Record<string, string> = {}
      if (call.header !== null) headers.Authorization = call.header
      if (call.body !== undefined) headers['Content-Type'] = 'application/json'

      const response = await fetch(`${baseUrl}${call.path}`, {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        credentials: 'omit',
        signal: controller.signal,
      })

      if (!current()) return { ok: false, error: aborted }

      if (response.status === 401) {
        if (call.regular && current() && options.getAuthHeader() !== null) {
          options.onUnauthorized()
        }
        return { ok: false, error: { kind: 'unauthorized' } }
      }
      if (!response.ok) {
        const error = await errorFromResponse(response)
        return { ok: false, error: current() ? error : aborted }
      }

      const result = await call.parse(response)
      return current() ? result : { ok: false, error: aborted }
    } catch (e) {
      return { ok: false, error: current() ? errorFromException(e) : aborted }
    } finally {
      for (const source of sources) source.removeEventListener('abort', onAbort)
    }
  }

  function parseJson<T>(guard: (v: unknown) => v is T) {
    return async (response: Response): Promise<Result<T>> => {
      let data: unknown
      try {
        data = await response.json()
      } catch (e) {
        // An abort while reading the body is an abort; anything else is an unusable response.
        const error = errorFromException(e)
        return { ok: false, error: error.kind === 'aborted' ? error : server }
      }
      return guard(data) ? { ok: true, value: data } : { ok: false, error: server }
    }
  }

  const parseNoContent = async (): Promise<Result<void>> => ({ ok: true, value: undefined })

  function regularCall<T>(call: Omit<Call<T>, 'header' | 'regular'>): Promise<Result<T>> {
    const header = options.getAuthHeader()
    if (header === null) {
      // No credentials held: nothing is sent and the session owner is not notified.
      return Promise.resolve({ ok: false, error: { kind: 'unauthorized' } })
    }
    return execute({ ...call, header, regular: true })
  }

  return {
    listTasks(page, size, opts) {
      const query = new URLSearchParams({ page: String(page), size: String(size) })
      return regularCall({
        path: `/tasks?${query.toString()}`,
        method: 'GET',
        signal: opts?.signal,
        parse: parseJson(isPage),
      })
    },
    createTask(body, opts) {
      return regularCall({
        path: '/tasks',
        method: 'POST',
        body,
        signal: opts?.signal,
        parse: parseJson(isTask),
      })
    },
    patchTask(id, patch, opts) {
      return regularCall({
        path: `/tasks/${encodeURIComponent(String(id))}`,
        method: 'PATCH',
        body: patch,
        signal: opts?.signal,
        parse: parseJson(isTask),
      })
    },
    deleteTask(id, opts) {
      return regularCall({
        path: `/tasks/${encodeURIComponent(String(id))}`,
        method: 'DELETE',
        signal: opts?.signal,
        parse: parseNoContent,
      })
    },
    probe(credentials) {
      const query = new URLSearchParams({ page: String(PROBE_PAGE), size: String(PROBE_SIZE) })
      return execute({
        path: `/tasks?${query.toString()}`,
        method: 'GET',
        header: basicHeader(credentials),
        regular: false,
        parse: parseJson(isPage),
      })
    },
    abortAll() {
      session.abort()
      session = new AbortController()
      sessionId += 1
    },
  }
}
