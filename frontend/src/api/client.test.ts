import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { basicHeader } from '../auth/basicHeader.ts'
import {
  API_BASE,
  TASKS_URL,
  TEST_CREDENTIALS,
  VALID_AUTH_HEADER,
  makeTask,
  makeTasks,
  resetDb,
  unauthorizedResponse,
} from '../test/handlers.ts'
import { requestCounter, server } from '../test/server.ts'
import { createApiClient } from './client.ts'

function setup(header: string | null = VALID_AUTH_HEADER) {
  const getAuthHeader = vi.fn(() => header)
  const onUnauthorized = vi.fn()
  const client = createApiClient({ baseUrl: API_BASE, getAuthHeader, onUnauthorized })
  return { client, getAuthHeader, onUnauthorized }
}

describe('api client: requests', () => {
  it('sends the Basic header, page and size, and credentials omit', async () => {
    resetDb(makeTasks(3))
    let seen: Request | undefined
    server.use(
      http.get(TASKS_URL, ({ request }) => {
        seen = request
        return HttpResponse.json({ content: [], page: 1, size: 5, totalElements: 0, totalPages: 0 })
      }),
    )
    const { client } = setup()
    const result = await client.listTasks(1, 5)
    expect(result.ok).toBe(true)
    expect(seen?.headers.get('authorization')).toBe(VALID_AUTH_HEADER)
    const url = new URL(seen!.url)
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('size')).toBe('5')
  })

  it('uses credentials: omit on every call', async () => {
    resetDb([makeTask()])
    const spy = vi.spyOn(globalThis, 'fetch')
    try {
      const { client } = setup()
      await client.listTasks(0, 20)
      await client.createTask({ title: 'a' })
      await client.patchTask(1, { status: 'DONE' })
      await client.deleteTask(1)
      await client.probe(TEST_CREDENTIALS)
      expect(spy).toHaveBeenCalledTimes(5)
      for (const call of spy.mock.calls) {
        expect((call[1] as RequestInit).credentials).toBe('omit')
      }
    } finally {
      spy.mockRestore()
    }
  })

  it('encodes non-ASCII credentials as UTF-8 in the probe header', async () => {
    const creds = { username: 'usér', password: 'пароль' }
    let header: string | null = null
    server.use(
      http.get(TASKS_URL, ({ request }) => {
        header = request.headers.get('authorization')
        return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }),
    )
    const { client } = setup(null)
    await client.probe(creds)
    expect(header).toBe(basicHeader(creds))
  })

  it('handles 201 on create and sends the JSON body', async () => {
    const { client } = setup()
    const result = await client.createTask({ title: 'New', status: 'IN_PROGRESS' })
    expect(result).toMatchObject({ ok: true, value: { title: 'New', status: 'IN_PROGRESS' } })
  })

  it('handles 204 on delete', async () => {
    resetDb([makeTask()])
    const { client } = setup()
    expect(await client.deleteTask(1)).toEqual({ ok: true, value: undefined })
  })

  it('sends only the given fields on patch, including null', async () => {
    resetDb([makeTask({ description: 'old' })])
    let body: unknown
    server.use(
      http.patch(`${TASKS_URL}/:id`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeTask())
      }),
    )
    const { client } = setup()
    await client.patchTask(1, { description: null })
    expect(body).toEqual({ description: null })
  })

  it('maps 404 to notFound and 400 to validation', async () => {
    const { client } = setup()
    expect(await client.deleteTask(99)).toEqual({ ok: false, error: { kind: 'notFound' } })
    const bad = await client.createTask({ title: ' ' })
    expect(bad).toMatchObject({
      ok: false,
      error: { kind: 'validation', fieldErrors: { title: ['must not be blank'] } },
    })
  })

  it('maps a 500 to a server error and a network failure to network', async () => {
    const { client } = setup()
    server.use(http.get(TASKS_URL, () => HttpResponse.text('stack trace here', { status: 500 })))
    expect(await client.listTasks(0, 20)).toEqual({ ok: false, error: { kind: 'server' } })
    server.use(http.get(TASKS_URL, () => HttpResponse.error()))
    expect(await client.listTasks(0, 20)).toEqual({ ok: false, error: { kind: 'network' } })
  })

  it('treats a 200 with an unexpected body as a server error', async () => {
    server.use(http.get(TASKS_URL, () => HttpResponse.json({ nope: true })))
    const { client } = setup()
    expect(await client.listTasks(0, 20)).toEqual({ ok: false, error: { kind: 'server' } })
  })

  it('sends no request when no credentials are held', async () => {
    const { client, onUnauthorized } = setup(null)
    expect(await client.listTasks(0, 20)).toEqual({ ok: false, error: { kind: 'unauthorized' } })
    expect(requestCounter.total()).toBe(0)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('api client: probe and 401', () => {
  it('probe builds its own header, never reads getAuthHeader and requests page 0 size 20', async () => {
    let url: URL | undefined
    let header: string | null = null
    server.use(
      http.get(TASKS_URL, ({ request }) => {
        url = new URL(request.url)
        header = request.headers.get('authorization')
        return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }),
    )
    const { client, getAuthHeader } = setup(null)
    const result = await client.probe(TEST_CREDENTIALS)
    expect(result.ok).toBe(true)
    expect(header).toBe(VALID_AUTH_HEADER)
    expect(url?.searchParams.get('page')).toBe('0')
    expect(url?.searchParams.get('size')).toBe('20')
    expect(getAuthHeader).not.toHaveBeenCalled()
  })

  it('probe 401 returns unauthorized without calling onUnauthorized', async () => {
    const { client, onUnauthorized } = setup(VALID_AUTH_HEADER)
    const result = await client.probe({ username: 'test-user', password: 'wrong' })
    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('a regular 401 calls onUnauthorized once', async () => {
    server.use(http.get(TASKS_URL, () => unauthorizedResponse()))
    const { client, onUnauthorized } = setup()
    const result = await client.listTasks(0, 20)
    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('a regular 401 does not call onUnauthorized once credentials were cleared', async () => {
    let held: string | null = VALID_AUTH_HEADER
    const onUnauthorized = vi.fn()
    const client = createApiClient({ baseUrl: API_BASE, getAuthHeader: () => held, onUnauthorized })
    server.use(
      http.get(TASKS_URL, () => {
        held = null
        return unauthorizedResponse()
      }),
    )
    await client.listTasks(0, 20)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('api client: abort and sessions', () => {
  it('maps a caller abort to aborted', async () => {
    server.use(
      http.get(TASKS_URL, async () => {
        await delay(200)
        return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }),
    )
    const { client, onUnauthorized } = setup()
    const controller = new AbortController()
    const pending = client.listTasks(0, 20, { signal: controller.signal })
    controller.abort()
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('maps an already aborted caller signal to aborted', async () => {
    const { client } = setup()
    const controller = new AbortController()
    controller.abort()
    expect(await client.listTasks(0, 20, { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'aborted' },
    })
  })

  it('abortAll cancels pending requests; a late 401 does not call onUnauthorized', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let answered: () => void = () => {}
    const handlerDone = new Promise<void>((resolve) => {
      answered = resolve
    })
    server.use(
      http.get(TASKS_URL, async () => {
        await gate
        answered()
        return unauthorizedResponse()
      }),
    )
    const { client, onUnauthorized } = setup()
    const pending = client.listTasks(0, 20)
    client.abortAll()
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } })
    release() // the server now answers 401 to the already-aborted request
    await handlerDone
    await new Promise((r) => setTimeout(r, 0))
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('abortAll drops a late successful result', async () => {
    resetDb(makeTasks(2))
    server.use(
      http.get(TASKS_URL, async () => {
        await delay(100)
        return HttpResponse.json({ content: makeTasks(2), page: 0, size: 20, totalElements: 2, totalPages: 1 })
      }),
    )
    const { client } = setup()
    const pending = client.listTasks(0, 20)
    client.abortAll()
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } })
  })

  it('works normally for requests started after abortAll (new session)', async () => {
    const { client, onUnauthorized } = setup()
    client.abortAll()
    expect((await client.listTasks(0, 20)).ok).toBe(true)
    server.use(http.get(TASKS_URL, () => unauthorizedResponse()))
    await client.listTasks(0, 20)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('abortAll cancels a pending probe', async () => {
    server.use(
      http.get(TASKS_URL, async () => {
        await delay(200)
        return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }),
    )
    const { client } = setup(null)
    const pending = client.probe(TEST_CREDENTIALS)
    client.abortAll()
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } })
  })

  it('removes its abort listener from a long-lived caller signal after requests settle', async () => {
    const { client } = setup()
    const caller = new AbortController()
    let live = 0
    const add = caller.signal.addEventListener.bind(caller.signal)
    const remove = caller.signal.removeEventListener.bind(caller.signal)
    caller.signal.addEventListener = ((...args: Parameters<typeof add>) => {
      if (args[0] === 'abort') live += 1
      return add(...args)
    }) as typeof caller.signal.addEventListener
    caller.signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
      if (args[0] === 'abort') live -= 1
      return remove(...args)
    }) as typeof caller.signal.removeEventListener

    for (let i = 0; i < 10; i += 1) await client.listTasks(0, 20, { signal: caller.signal })
    expect(live).toBe(0)
  })
})
