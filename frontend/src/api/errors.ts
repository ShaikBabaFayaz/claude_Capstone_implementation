import type { ApiError, ProblemBody, ProblemFieldError } from './types.ts'

/** Fixed texts. Raw server text is never used for network failures, 5xx or unparsable bodies. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials.'
export const NOT_FOUND_MESSAGE = 'The task no longer exists.'
export const ALREADY_DELETED_MESSAGE = 'That task was already deleted. The list has been refreshed.'
export const VALIDATION_FALLBACK_MESSAGE = 'The request was not valid. Please check your input.'

export const FORM_FIELDS = ['title', 'description', 'status'] as const
export type FormField = (typeof FORM_FIELDS)[number]

/** `description.value` and `status[0]` both map to their base field name. */
export function normaliseField(field: string): string {
  const cut = field.search(/[.[]/)
  return cut < 0 ? field : field.slice(0, cut)
}

function isFormField(name: string): name is FormField {
  return (FORM_FIELDS as readonly string[]).includes(name)
}

function parseFieldErrors(value: unknown): ProblemFieldError[] {
  if (!Array.isArray(value)) return []
  const out: ProblemFieldError[] = []
  for (const item of value) {
    if (typeof item === 'object' && item !== null) {
      const { field, message } = item as Record<string, unknown>
      if (typeof field === 'string') {
        out.push({ field, message: typeof message === 'string' ? message : '' })
      }
    }
  }
  return out
}

/** Parses a response body defensively. Returns null if it is not a JSON object. Never throws. */
export function parseProblemBody(contentType: string | null, text: string): ProblemBody | null {
  if (!contentType || !contentType.toLowerCase().includes('json')) return null
  try {
    const raw: unknown = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const obj = raw as Record<string, unknown>
    return {
      title: typeof obj.title === 'string' ? obj.title : undefined,
      detail: typeof obj.detail === 'string' ? obj.detail : undefined,
      status: typeof obj.status === 'number' ? obj.status : undefined,
      errors: parseFieldErrors(obj.errors),
    }
  } catch {
    return null
  }
}

function validationFromProblem(body: ProblemBody): ApiError {
  const fieldErrors: Record<string, string[]> = {}
  const general: string[] = []
  for (const entry of body.errors ?? []) {
    const message = entry.message.trim() === '' ? VALIDATION_FALLBACK_MESSAGE : entry.message
    const name = normaliseField(entry.field)
    if (isFormField(name)) {
      fieldErrors[name] = [...(fieldErrors[name] ?? []), message]
    } else {
      general.push(message)
    }
  }
  if (Object.keys(fieldErrors).length === 0 && general.length === 0) {
    general.push(body.detail && body.detail.trim() !== '' ? body.detail : VALIDATION_FALLBACK_MESSAGE)
  }
  return { kind: 'validation', detail: body.detail, fieldErrors, general }
}

/** Maps a non-2xx response to an ApiError. Never throws. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  if (response.status === 401) return { kind: 'unauthorized' }
  if (response.status === 404) return { kind: 'notFound' }
  if (response.status === 400) {
    let text: string
    try {
      text = await response.text()
    } catch {
      return { kind: 'server' }
    }
    const body = parseProblemBody(response.headers.get('content-type'), text)
    return body ? validationFromProblem(body) : { kind: 'server' }
  }
  return { kind: 'server' }
}

/** Maps a thrown fetch error: an abort is `aborted`, anything else is `network`. */
export function errorFromException(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') {
    return { kind: 'aborted' }
  }
  return { kind: 'network' }
}

/** User-facing text for errors that are not field errors. */
export function messageFor(error: ApiError): string {
  switch (error.kind) {
    case 'unauthorized':
      return INVALID_CREDENTIALS_MESSAGE
    case 'notFound':
      return NOT_FOUND_MESSAGE
    case 'validation':
      return error.general[0] ?? VALIDATION_FALLBACK_MESSAGE
    case 'aborted':
    case 'server':
    case 'network':
      return GENERIC_ERROR_MESSAGE
  }
}
