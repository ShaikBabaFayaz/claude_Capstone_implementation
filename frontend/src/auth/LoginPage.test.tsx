import { screen, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { GENERIC_ERROR_MESSAGE } from '../api/errors.ts'
import { makeTasks, pageOf, TASKS_URL, TEST_CREDENTIALS, VALID_AUTH_HEADER } from '../test/handlers.ts'
import { requestCounter, server } from '../test/server.ts'
import { renderApp } from '../test/render.tsx'

type User = ReturnType<typeof renderApp>['user']

async function submitLogin(user: User, credentials = TEST_CREDENTIALS) {
  await user.type(screen.getByLabelText('Username'), credentials.username)
  await user.type(screen.getByLabelText('Password'), credentials.password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  it('shows labelled fields and makes no request before submit (AC-1a)', () => {
    renderApp(<App />)
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(requestCounter.total()).toBe(0)
  })

  it('sends a Basic header and shows the task screen on 200 (AC-1b)', async () => {
    let header: string | null = null
    server.use(
      http.get(TASKS_URL, ({ request }) => {
        header = request.headers.get('authorization')
        return HttpResponse.json(pageOf(makeTasks(2), 0, 20))
      }),
    )
    const { user } = renderApp(<App />)
    await submitLogin(user)
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(header).toBe(VALID_AUTH_HEADER)
    expect(header).toMatch(/^Basic /)
  })

  it('shows "invalid credentials" on 401 and stays on the form (AC-1c)', async () => {
    const { user } = renderApp(<App />)
    await submitLogin(user, { username: 'test-user', password: 'wrong' })
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i)
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument()
  })

  it('shows the generic message on a 500 and keeps no server text (AC-6b)', async () => {
    server.use(http.get(TASKS_URL, () => HttpResponse.text('stack trace <b>secret</b>', { status: 500 })))
    const { user } = renderApp(<App />)
    await submitLogin(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('shows the generic message on a network failure (AC-6b)', async () => {
    server.use(http.get(TASKS_URL, () => HttpResponse.error()))
    const { user } = renderApp(<App />)
    await submitLogin(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('disables submit in flight and sends one request on double activation (AC-6c)', async () => {
    server.use(
      http.get(TASKS_URL, async () => {
        await delay(100)
        return HttpResponse.json(pageOf([], 0, 20))
      }),
    )
    const { user } = renderApp(<App />)
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
    await user.dblClick(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled())
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(requestCounter.count('GET', '/api/tasks')).toBe(1)
  })

  it('re-enables submit after a failed login', async () => {
    const { user } = renderApp(<App />)
    await submitLogin(user, { username: 'test-user', password: 'wrong' })
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})
