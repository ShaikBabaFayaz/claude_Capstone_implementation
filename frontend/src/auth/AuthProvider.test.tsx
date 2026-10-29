import { act, render, screen, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import { TASKS_URL, TEST_CREDENTIALS, unauthorizedResponse } from '../test/handlers.ts'
import { requestCounter, server } from '../test/server.ts'
import { renderApp } from '../test/render.tsx'
import { useAuth } from './useAuth.ts'

// Rendered next to App (always mounted) so tests can fire regular requests through the shared client.
function Probe() {
  const { client, isAuthenticated } = useAuth()
  const [result, setResult] = useState('none')
  return (
    <div>
      <p data-testid="auth">{isAuthenticated ? 'in' : 'out'}</p>
      <p data-testid="result">{result}</p>
      <button
        type="button"
        onClick={() => {
          setResult('pending')
          void client.listTasks(0, 5).then((r) => setResult(r.ok ? 'ok' : r.error.kind))
        }}
      >
        probe list
      </button>
    </div>
  )
}

function renderWithProbe() {
  return renderApp(
    <>
      <App />
      <Probe />
    </>,
  )
}

type User = ReturnType<typeof renderApp>['user']

async function login(user: User) {
  await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
  await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Tasks' })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AuthProvider', () => {
  it('issues exactly one GET /api/tasks after login (the probe seeds the list)', async () => {
    const { user } = renderWithProbe()
    await login(user)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0)) // yield to any queued request
    })
    expect(requestCounter.count('GET', '/api/tasks')).toBe(1)
    expect(requestCounter.total()).toBe(1)
  })

  it('holds no credentials after a failed login (401)', async () => {
    const { user } = renderWithProbe()
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('alert')
    expect(screen.getByTestId('auth')).toHaveTextContent('out')

    const before = requestCounter.total()
    await user.click(screen.getByRole('button', { name: 'probe list' }))
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('unauthorized'))
    // nothing was sent, so no later request carried an Authorization header
    expect(requestCounter.total()).toBe(before)
    expect(screen.getByTestId('auth')).toHaveTextContent('out')
  })

  it('holds no credentials after a failed login (500 and network failure)', async () => {
    server.use(http.get(TASKS_URL, () => new HttpResponse(null, { status: 500 })))
    const { user } = renderWithProbe()
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('alert')

    server.use(http.get(TASKS_URL, () => HttpResponse.error()))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(requestCounter.total()).toBe(2))
    await screen.findByRole('alert')

    const before = requestCounter.total()
    await user.click(screen.getByRole('button', { name: 'probe list' }))
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('unauthorized'))
    expect(requestCounter.total()).toBe(before)
    expect(screen.getByTestId('auth')).toHaveTextContent('out')
  })

  it('does not write to localStorage, sessionStorage or cookies (AC-1d)', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem')
    const cookie = vi.spyOn(document, 'cookie', 'set')
    const { user } = renderWithProbe()
    await login(user)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(local).not.toHaveBeenCalled()
    expect(cookie).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })

  it('shows the login form on a fresh render, as after a reload (AC-1d)', async () => {
    const first = renderWithProbe()
    await login(first.user)
    first.unmount()
    requestCounter.reset()
    renderWithProbe()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument()
    expect(requestCounter.total()).toBe(0)
  })

  it('returns to the login form on a 401 after login (AC-1e)', async () => {
    const { user } = renderWithProbe()
    await login(user)
    server.use(http.get(TASKS_URL, () => unauthorizedResponse()))
    await user.click(screen.getByRole('button', { name: 'probe list' }))
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('out'))
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('sign-out clears the credentials and the seed (AC-1f)', async () => {
    const { user } = renderWithProbe()
    await login(user)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    const before = requestCounter.total()
    await user.click(screen.getByRole('button', { name: 'probe list' }))
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('unauthorized'))
    expect(requestCounter.total()).toBe(before)
  })

  it('sign-out during a pending list request leaves no state update and no second sign-out (AC-1e, AC-1f)', async () => {
    const { user } = renderWithProbe()
    await login(user)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(TASKS_URL, async () => {
        await gate
        return unauthorizedResponse()
      }),
    )
    await user.click(screen.getByRole('button', { name: 'probe list' }))
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('pending'))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    // the pending request is aborted: it resolves as aborted, not applied as an error
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('aborted'))

    // sign in again as a new session, then let the old request's late 401 arrive
    server.resetHandlers()
    await login(user)
    await act(async () => {
      release()
      await delay(50)
    })
    expect(screen.getByTestId('auth')).toHaveTextContent('in')
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('throws when useAuth is used outside the provider', () => {
    function Bare() {
      useAuth()
      return null
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/inside AuthProvider/)
  })
})
