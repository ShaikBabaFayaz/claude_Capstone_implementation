import { describe, expect, it } from 'vitest'
import {
  GENERIC_ERROR_MESSAGE,
  VALIDATION_FALLBACK_MESSAGE,
  errorFromException,
  errorFromResponse,
  messageFor,
  normaliseField,
  parseProblemBody,
} from './errors.ts'
import type { ApiError } from './types.ts'

function problem(status: number, body: unknown, contentType = 'application/problem+json') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  })
}

describe('normaliseField', () => {
  it('cuts at the first dot or bracket', () => {
    expect(normaliseField('title')).toBe('title')
    expect(normaliseField('description.value')).toBe('description')
    expect(normaliseField('status[0]')).toBe('status')
    expect(normaliseField('status[0].name')).toBe('status')
  })
})

describe('parseProblemBody', () => {
  it('reads detail and errors[]', () => {
    const body = parseProblemBody(
      'application/problem+json',
      JSON.stringify({ detail: 'd', errors: [{ field: 'title', message: 'm' }, { nope: 1 }] }),
    )
    expect(body).toMatchObject({ detail: 'd', errors: [{ field: 'title', message: 'm' }] })
  })

  it('returns null for non-JSON content type, bad JSON, arrays and scalars', () => {
    expect(parseProblemBody('text/html', '<html>')).toBeNull()
    expect(parseProblemBody(null, '{}')).toBeNull()
    expect(parseProblemBody('application/json', '{oops')).toBeNull()
    expect(parseProblemBody('application/json', '[]')).toBeNull()
    expect(parseProblemBody('application/json', '"x"')).toBeNull()
  })
})

describe('errorFromResponse', () => {
  it('maps 401 and 404', async () => {
    expect(await errorFromResponse(problem(401, {}))).toEqual({ kind: 'unauthorized' })
    expect(await errorFromResponse(problem(404, {}))).toEqual({ kind: 'notFound' })
  })

  it('maps errors[] to fields, including suffixed names', async () => {
    const error = await errorFromResponse(
      problem(400, {
        detail: 'Validation failed.',
        errors: [
          { field: 'title', message: 'must not be blank' },
          { field: 'description.value', message: 'too long' },
          { field: 'status[0]', message: 'bad status' },
        ],
      }),
    )
    expect(error).toEqual({
      kind: 'validation',
      detail: 'Validation failed.',
      fieldErrors: {
        title: ['must not be blank'],
        description: ['too long'],
        status: ['bad status'],
      },
      general: [],
    })
  })

  it('sends unknown fields to the general messages', async () => {
    const error = await errorFromResponse(
      problem(400, { errors: [{ field: 'page', message: 'must be at least 0' }] }),
    )
    expect(error).toMatchObject({ kind: 'validation', fieldErrors: {}, general: ['must be at least 0'] })
  })

  it('shows a detail-only 400 as a general message', async () => {
    const error = await errorFromResponse(problem(400, { detail: 'Request body is missing.' }))
    expect(error).toMatchObject({ kind: 'validation', general: ['Request body is missing.'] })
  })

  it('uses a fixed text when a 400 has neither errors nor detail', async () => {
    const error = await errorFromResponse(problem(400, {}))
    expect(error).toMatchObject({ kind: 'validation', general: [VALIDATION_FALLBACK_MESSAGE] })
  })

  it('treats a non-JSON proxy body as a server error without raw text', async () => {
    const error = await errorFromResponse(problem(502, 'Bad gateway: secret-internal-host', 'text/html'))
    expect(error).toEqual({ kind: 'server' })
    expect(messageFor(error)).toBe(GENERIC_ERROR_MESSAGE)
    expect(messageFor(error)).not.toContain('secret-internal-host')
  })

  it('treats a 400 with a non-JSON body as a server error', async () => {
    expect(await errorFromResponse(problem(400, '<html>nope</html>', 'text/html'))).toEqual({
      kind: 'server',
    })
  })

  it('treats 5xx problem+json as server error and never exposes its detail', async () => {
    const error = await errorFromResponse(
      problem(500, { title: 'Internal Server Error', detail: 'NullPointerException at Foo.java:12' }),
    )
    expect(error).toEqual({ kind: 'server' })
    expect(JSON.stringify(error)).not.toContain('NullPointer')
    expect(messageFor(error)).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('does not throw when the body cannot be read', async () => {
    const response = problem(400, {})
    Object.defineProperty(response, 'text', { value: () => Promise.reject(new Error('boom')) })
    expect(await errorFromResponse(response)).toEqual({ kind: 'server' })
  })
})

describe('errorFromException', () => {
  it('maps AbortError to aborted and everything else to network', () => {
    expect(errorFromException(new DOMException('x', 'AbortError'))).toEqual({ kind: 'aborted' })
    expect(errorFromException(new TypeError('Failed to fetch: host.internal'))).toEqual({ kind: 'network' })
    expect(errorFromException('weird')).toEqual({ kind: 'network' })
  })
})

describe('messageFor', () => {
  it('gives fixed generic text for server, network and aborted', () => {
    const kinds: ApiError[] = [{ kind: 'server' }, { kind: 'network' }, { kind: 'aborted' }]
    for (const error of kinds) expect(messageFor(error)).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('says invalid credentials for unauthorized', () => {
    expect(messageFor({ kind: 'unauthorized' })).toMatch(/invalid credentials/i)
  })
})
