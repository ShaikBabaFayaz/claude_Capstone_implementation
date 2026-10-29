import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import {
  TASKS_URL,
  VALID_AUTH_HEADER,
  makeTasks,
  resetDb,
} from './handlers.ts'
import { requestCounter, server } from './server.ts'

const auth = { authorization: VALID_AUTH_HEADER }

function send(method: string, url: string, body?: unknown, headers: Record<string, string> = auth) {
  return fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('shared MSW handlers', () => {
  it('returns the page contract shape', async () => {
    resetDb(makeTasks(3))
    const res = await send('GET', `${TASKS_URL}?page=0&size=2`)
    expect(res.status).toBe(200)
    const page = await res.json()
    expect(page).toMatchObject({ page: 0, size: 2, totalElements: 3, totalPages: 2 })
    expect(page.content).toHaveLength(2)
    expect(Object.keys(page.content[0]).sort()).toEqual(
      ['createdAt', 'description', 'id', 'status', 'title', 'updatedAt'],
    )
  })

  it('returns a problem+json 401 without valid credentials', async () => {
    const res = await send('GET', TASKS_URL, undefined, {})
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect((await res.json()).title).toBe('Unauthorized')
  })

  it('returns a problem+json 400 with errors[] for a blank title', async () => {
    const res = await send('POST', TASKS_URL, { title: '  ' })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect((await res.json()).errors).toEqual([{ field: 'title', message: 'must not be blank' }])
  })

  it('returns a suffixed field name for an over-length PATCH description', async () => {
    resetDb(makeTasks(1))
    const res = await send('PATCH', `${TASKS_URL}/1`, { description: 'x'.repeat(2001) })
    expect(res.status).toBe(400)
    expect((await res.json()).errors[0].field).toBe('description.value')
  })

  it('creates with 201, patches, and deletes with 204 then 404', async () => {
    const created = await send('POST', TASKS_URL, { title: 'New' })
    expect(created.status).toBe(201)
    const task = await created.json()
    const patched = await send('PATCH', `${TASKS_URL}/${task.id}`, { status: 'DONE' })
    expect((await patched.json()).status).toBe('DONE')
    expect((await send('DELETE', `${TASKS_URL}/${task.id}`)).status).toBe(204)
    expect((await send('DELETE', `${TASKS_URL}/${task.id}`)).status).toBe(404)
  })

  it('counts requests by method and path', async () => {
    await send('GET', `${TASKS_URL}?page=0&size=20`)
    await send('GET', `${TASKS_URL}?page=1&size=20`)
    await send('POST', TASKS_URL, { title: 'x' })
    expect(requestCounter.count('GET', '/api/tasks')).toBe(2)
    expect(requestCounter.count('POST', '/api/tasks')).toBe(1)
    expect(requestCounter.total()).toBe(3)
    requestCounter.reset()
    expect(requestCounter.total()).toBe(0)
  })

  it('lets a test override a handler with server.use', async () => {
    server.use(http.get(TASKS_URL, () => HttpResponse.text('boom', { status: 500 })))
    expect((await send('GET', TASKS_URL)).status).toBe(500)
  })

  it('fails an unmocked request (onUnhandledRequest: error)', async () => {
    await expect(fetch('http://localhost:8080/api/not-mocked')).rejects.toBeDefined()
  })
})
