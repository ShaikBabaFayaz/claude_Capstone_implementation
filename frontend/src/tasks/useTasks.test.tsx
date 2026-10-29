import { act, renderHook, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../api/client.ts'
import {
  API_BASE,
  dbTasks,
  makeTasks,
  pageOf,
  resetDb,
  TASKS_URL,
  VALID_AUTH_HEADER,
} from '../test/handlers.ts'
import { requestCounter, server } from '../test/server.ts'
import { useTasks } from './useTasks.ts'

function makeClient() {
  return createApiClient({
    baseUrl: API_BASE,
    getAuthHeader: () => VALID_AUTH_HEADER,
    onUnauthorized: vi.fn(),
  })
}

// Records "page,size" of every list request, in order.
let listed: string[] = []
const record = ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/tasks') {
    listed.push(`${url.searchParams.get('page')},${url.searchParams.get('size')}`)
  }
}

beforeEach(() => {
  listed = []
  server.events.on('request:start', record)
})

afterEach(() => {
  server.events.removeListener('request:start', record)
})

function seedFor(count: number, page = 0, size = 20) {
  resetDb(makeTasks(count))
  return pageOf(dbTasks(), page, size)
}

describe('useTasks', () => {
  it('uses the seed as initial state and makes no mount GET', async () => {
    const seed = seedFor(3)
    const client = makeClient()
    const listTasks = vi.spyOn(client, 'listTasks')
    const { result } = renderHook(() => useTasks(client, seed))
    expect(result.current.status).toBe('ready')
    expect(result.current.data).toEqual(seed)
    expect(listTasks).not.toHaveBeenCalled() // the mount effect runs synchronously inside renderHook
    expect(requestCounter.count('GET', '/api/tasks')).toBe(0)
  })

  it('loads the first page on mount when there is no seed', async () => {
    resetDb(makeTasks(3))
    const client = makeClient()
    const { result } = renderHook(() => useTasks(client, null))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data?.content).toHaveLength(3)
    expect(listed).toEqual(['0,20'])
  })

  it('applies only the latest response when responses arrive out of order', async () => {
    const seed = seedFor(30, 0, 10)
    let releaseSlow: () => void = () => {}
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve
    })
    server.use(
      http.get(TASKS_URL, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        if (page === 1) await slowGate // held until page 2 has been applied: superseded
        return HttpResponse.json(pageOf(dbTasks(), page, 10))
      }),
    )
    const client = makeClient()
    const listTasks = vi.spyOn(client, 'listTasks')
    const { result } = renderHook(() => useTasks(client, seed))
    act(() => {
      result.current.setPage(1)
      result.current.setPage(2)
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data?.page).toBe(2)
    releaseSlow()
    await act(async () => {
      await Promise.allSettled(listTasks.mock.results.map((r) => r.value))
    })
    expect(result.current.data?.page).toBe(2)
    expect(result.current.page).toBe(2)
  })

  it('clamps an out-of-range page to min(page - 1, totalPages - 1)', async () => {
    const seed = seedFor(25, 0, 10)
    const client = makeClient()
    const { result } = renderHook(() => useTasks(client, seed))
    act(() => result.current.setPage(7))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data?.page).toBe(2)
    expect(result.current.data?.content).toHaveLength(5)
    expect(listed).toEqual(['7,10', '2,10'])
  })

  it('shows the empty state on page 0 of an empty list (no clamp loop)', async () => {
    const seed = seedFor(0)
    const client = makeClient()
    const { result } = renderHook(() => useTasks(client, seed))
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data?.content).toEqual([])
    expect(listed).toEqual(['0,20'])
  })

  it('resets to page 0 when the size changes', async () => {
    const seed = seedFor(30, 0, 10)
    const client = makeClient()
    const { result } = renderHook(() => useTasks(client, seed))
    act(() => result.current.setPage(2))
    await waitFor(() => expect(result.current.data?.page).toBe(2))
    act(() => {
      expect(result.current.setSize(5)).toBe(true)
    })
    await waitFor(() => expect(result.current.data?.size).toBe(5))
    expect(result.current.data?.page).toBe(0)
    expect(listed.at(-1)).toBe('0,5')
  })

  it('does not send an invalid size (0, 101, non-integer)', async () => {
    const seed = seedFor(3)
    const client = makeClient()
    const listTasks = vi.spyOn(client, 'listTasks')
    const { result } = renderHook(() => useTasks(client, seed))
    for (const bad of [0, 101, 2.5, Number.NaN, -3]) {
      act(() => {
        expect(result.current.setSize(bad)).toBe(false)
      })
    }
    expect(listTasks).not.toHaveBeenCalled()
    expect(listed).toEqual([])
    expect(result.current.status).toBe('ready')
  })

  describe('goToLastPage (post-create, single GET)', () => {
    async function createThenGoToLast(
      result: { current: ReturnType<typeof useTasks> },
      client: ReturnType<typeof makeClient>,
    ) {
      const created = await client.createTask({ title: 'New task' })
      expect(created.ok).toBe(true)
      act(() => result.current.goToLastPage())
    }

    it('requests max(ceil((total + 1) / size) - 1, 0) with an exact-multiple total', async () => {
      const seed = seedFor(20, 0, 10)
      const client = makeClient()
      const { result } = renderHook(() => useTasks(client, seed))
      await createThenGoToLast(result, client)
      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(listed).toEqual(['2,10'])
      expect(result.current.data?.page).toBe(2)
      expect(result.current.data?.content.map((t) => t.title)).toEqual(['New task'])
    })

    it('goes to page 0 for an empty list', async () => {
      const seed = seedFor(0)
      const client = makeClient()
      const { result } = renderHook(() => useTasks(client, seed))
      await createThenGoToLast(result, client)
      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(listed).toEqual(['0,20'])
      expect(result.current.data?.content).toHaveLength(1)
    })

    it('uses size and total of the applied response after a settled size change', async () => {
      const seed = seedFor(30, 0, 20)
      const client = makeClient()
      const { result } = renderHook(() => useTasks(client, seed))
      act(() => {
        result.current.setSize(5)
      })
      await waitFor(() => expect(result.current.data?.size).toBe(5))
      listed = []
      await createThenGoToLast(result, client)
      await waitFor(() => expect(result.current.data?.page).toBe(6))
      expect(listed).toEqual(['6,5']) // ceil(31 / 5) - 1 = 6, not a guess from size 20
      expect(result.current.data?.content).toHaveLength(1)
    })

    it('uses the applied response, not the pending size, right after a size change', async () => {
      const seed = seedFor(30, 0, 20)
      const client = makeClient()
      server.use(
        http.get(TASKS_URL, async ({ request }) => {
          const url = new URL(request.url)
          const size = Number(url.searchParams.get('size'))
          if (size === 5) await delay(150) // size change still in flight
          return HttpResponse.json(pageOf(dbTasks(), Number(url.searchParams.get('page')), size))
        }),
      )
      const { result } = renderHook(() => useTasks(client, seed))
      act(() => {
        result.current.setSize(5) // in flight; the applied response is still size 20, total 30
      })
      listed = []
      await createThenGoToLast(result, client)
      await waitFor(() => expect(result.current.status).toBe('ready'))
      // size 20, total 30 (applied response) -> page ceil(31 / 20) - 1 = 1, with size 20
      expect(listed).toEqual(['1,20'])
      expect(result.current.data?.size).toBe(20)
      expect(result.current.data?.page).toBe(1)
    })

    it('lands on a lower page and stops when a concurrent delete makes the guess too high', async () => {
      const seed = seedFor(20, 0, 10)
      const client = makeClient()
      const listTasks = vi.spyOn(client, 'listTasks')
      const { result } = renderHook(() => useTasks(client, seed))
      resetDb(makeTasks(10)) // another client deleted ten tasks
      act(() => result.current.goToLastPage()) // guess: page 2, which is now empty
      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(listed).toEqual(['2,10', '0,10']) // clamp min(1, 0) = 0, then no further request
      expect(result.current.data?.page).toBe(0)
      await act(async () => {
        await Promise.allSettled(listTasks.mock.results.map((r) => r.value))
      })
      expect(listTasks).toHaveBeenCalledTimes(2) // no further clamp request
      expect(listed).toHaveLength(2)
    })

    it('refetches the current page when no response was applied (error state)', async () => {
      server.use(http.get(TASKS_URL, () => new HttpResponse(null, { status: 500 }), { once: true }))
      resetDb(makeTasks(3))
      const client = makeClient()
    const { result } = renderHook(() => useTasks(client, null))
      await waitFor(() => expect(result.current.status).toBe('error'))
      act(() => result.current.goToLastPage())
      await waitFor(() => expect(result.current.status).toBe('ready'))
      expect(listed).toEqual(['0,20', '0,20'])
    })
  })

  it('loads the previous page after the last item of a page greater than 0 is deleted', async () => {
    const seed = seedFor(11, 0, 10)
    const client = makeClient()
    const { result } = renderHook(() => useTasks(client, seed))
    act(() => result.current.setPage(1))
    await waitFor(() => expect(result.current.data?.page).toBe(1))
    expect(result.current.data?.content).toHaveLength(1)

    const deleted = await client.deleteTask(11)
    expect(deleted.ok).toBe(true)
    listed = []
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.data?.content).toHaveLength(10))
    expect(result.current.data?.page).toBe(0)
    expect(listed).toEqual(['1,10', '0,10'])
  })

  it('shows an error state on a failed load and retries with refetch', async () => {
    const seed = seedFor(3)
    server.use(http.get(TASKS_URL, () => new HttpResponse(null, { status: 500 }), { once: true }))
    const client = makeClient()
    const { result } = renderHook(() => useTasks(client, seed))
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toEqual({ kind: 'server' })
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('ignores late results after unmount (does not even start a clamp request)', async () => {
    // A late result that would trigger a clamp request (empty page above 0) if it were applied.
    // Without the unmount guard in useTasks the hook would call listTasks a second time.
    const seed = seedFor(3)
    let resolveLate: (value: Awaited<ReturnType<ReturnType<typeof makeClient>['listTasks']>>) => void = () => {}
    const late = new Promise<Awaited<ReturnType<ReturnType<typeof makeClient>['listTasks']>>>((resolve) => {
      resolveLate = resolve
    })
    const client = makeClient()
    const listTasks = vi
      .spyOn(client, 'listTasks')
      .mockReturnValueOnce(late)
      // Any further call (only possible if the late result was applied) gets a harmless page.
      .mockResolvedValue({ ok: true, value: pageOf(makeTasks(1), 0, 20) })
    const { result, unmount } = renderHook(() => useTasks(client, seed))
    act(() => result.current.refetch())
    expect(listTasks).toHaveBeenCalledTimes(1)
    unmount()
    resolveLate({ ok: true, value: { content: [], page: 3, size: 20, totalElements: 0, totalPages: 0 } })
    await late
    await Promise.resolve()
    expect(listTasks).toHaveBeenCalledTimes(1)
  })
})
