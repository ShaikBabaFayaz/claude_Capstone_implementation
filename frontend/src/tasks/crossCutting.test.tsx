import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import { GENERIC_ERROR_MESSAGE } from '../api/errors.ts'
import type { Task } from '../api/types.ts'
import {
  TASKS_URL,
  TEST_CREDENTIALS,
  makeTasks,
  problemResponse,
  resetDb,
  unauthorizedResponse,
} from '../test/handlers.ts'
import { renderApp } from '../test/render.tsx'
import { requestCounter, server } from '../test/server.ts'

// Cross-cutting tests (AC-1d, AC-6b, AC-6c, AC-10, AC-12) that run through the whole app.

type User = ReturnType<typeof renderApp>['user']

const SECRET = 'SECRET-SERVER-TEXT'

const FAILURES: [string, () => Response][] = [
  ['500 problem+json', () => problemResponse(500, 'Internal Server Error', SECRET)],
  ['network failure', () => HttpResponse.error()],
  [
    '502 non-JSON proxy body',
    () => new HttpResponse(`<html><body>${SECRET}</body></html>`, { status: 502, headers: { 'content-type': 'text/html' } }),
  ],
]

async function loginWithMouse(user: User) {
  await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
  await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Tasks' })
}

async function startSession(tasks: Task[] = makeTasks(3)) {
  resetDb(tasks)
  const view = renderApp(<App />)
  await loginWithMouse(view.user)
  return view
}

function dialog() {
  return screen.getByRole('dialog')
}

function slow(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
  return http[method](path, async () => {
    await delay(100)
    return undefined // fall through to the default handler
  })
}

/** Moves focus with Tab only until the named control has it. */
async function tabTo(user: User, role: 'button' | 'combobox' | 'textbox', name: string) {
  const target = await screen.findByRole(role, { name })
  for (let i = 0; i < 60; i += 1) {
    if (document.activeElement === target) return target
    await user.tab()
  }
  throw new Error(`Tab never reached ${role} "${name}"`)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(FAILURES)('generic error, no raw server text: %s', (_label, failure) => {
  it('login', async () => {
    server.use(http.get(TASKS_URL, failure))
    const { user } = renderApp(<App />)
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(document.body).not.toHaveTextContent(SECRET)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('list load, with Retry offered', async () => {
    const { user } = await startSession()
    server.use(http.get(TASKS_URL, failure))
    const size = screen.getByLabelText('Page size')
    await user.clear(size)
    await user.type(size, '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(SECRET)
  })

  it('create', async () => {
    const { user } = await startSession()
    server.use(http.post(TASKS_URL, failure))
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'New one')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(document.body).not.toHaveTextContent(SECRET)
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('New one')
  })

  it('edit', async () => {
    const { user } = await startSession()
    server.use(http.patch(`${TASKS_URL}/:id`, failure))
    await user.click(screen.getByRole('button', { name: 'Edit Task 1' }))
    const title = within(dialog()).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Renamed')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(document.body).not.toHaveTextContent(SECRET)
  })

  it('delete', async () => {
    const { user } = await startSession()
    server.use(http.delete(`${TASKS_URL}/:id`, failure))
    await user.click(screen.getByRole('button', { name: 'Delete Task 1' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(document.body).not.toHaveTextContent(SECRET)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })

  it('status change', async () => {
    const { user } = await startSession()
    server.use(http.patch(`${TASKS_URL}/:id`, failure))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status of Task 1' }), 'DONE')
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(document.body).not.toHaveTextContent(SECRET)
    expect(screen.getByRole('combobox', { name: 'Status of Task 1' })).toHaveValue('TODO')
  })
})

describe('401 in the middle of a session returns to the login form (AC-1e)', () => {
  it('on a list load', async () => {
    const { user } = await startSession()
    server.use(http.get(TASKS_URL, () => unauthorizedResponse()))
    const size = screen.getByLabelText('Page size')
    await user.clear(size)
    await user.type(size, '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Task 1')).not.toBeInTheDocument()
  })

  it('on confirming a delete, closing the dialog', async () => {
    const { user } = await startSession()
    server.use(http.delete(`${TASKS_URL}/:id`, () => unauthorizedResponse()))
    await user.click(screen.getByRole('button', { name: 'Delete Task 1' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('on a create submit, discarding the unsaved form', async () => {
    const { user } = await startSession()
    server.use(http.post(TASKS_URL, () => unauthorizedResponse()))
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'Unsaved')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await loginWithMouse(user)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Unsaved')).not.toBeInTheDocument()
  })
})

describe('keyboard-only operation (AC-12)', () => {
  it('logs in with Tab, typing and Enter', async () => {
    resetDb(makeTasks(2))
    const { user } = renderApp(<App />)
    await user.tab()
    expect(screen.getByLabelText('Username')).toHaveFocus()
    await user.keyboard(TEST_CREDENTIALS.username)
    await user.tab()
    expect(screen.getByLabelText('Password')).toHaveFocus()
    await user.keyboard(TEST_CREDENTIALS.password)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })

  it('operates the list controls, status select and Edit trigger', async () => {
    const { user } = await startSession(makeTasks(3))

    // Page size: reach the field and Apply with Tab, edit with the keyboard.
    await tabTo(user, 'textbox', 'Page size')
    await user.keyboard('{Backspace}{Backspace}2')
    await tabTo(user, 'button', 'Apply')
    await user.keyboard('{Enter}')
    await screen.findByText('Page 1 of 2')
    // The control is not remounted by the size change, so focus stays on Apply (F2).
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Page size' })).toHaveValue('2')

    await tabTo(user, 'button', 'Next')
    await user.keyboard('{Enter}')
    await screen.findByText('Page 2 of 2')
    expect(screen.getByText('Task 3')).toBeInTheDocument()

    await tabTo(user, 'button', 'Previous')
    await user.keyboard(' ')
    await screen.findByText('Page 1 of 2')

    // Status select: reachable by Tab. user-event cannot change a native select with arrow keys,
    // so the value is changed with selectOptions once the select has keyboard focus.
    const select = await tabTo(user, 'combobox', 'Status of Task 1')
    await user.selectOptions(select, 'DONE')
    await waitFor(() => expect(select).toHaveValue('DONE'))

    // Edit trigger opens the form from the keyboard, focus moves to Title.
    await tabTo(user, 'button', 'Edit Task 1')
    await user.keyboard('{Enter}')
    expect(within(dialog()).getByLabelText('Title')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Edit Task 1' })).toHaveFocus()

    // Sign out from the keyboard.
    await tabTo(user, 'button', 'Sign out')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('operates the create form from the keyboard and returns focus to New task', async () => {
    const { user } = await startSession(makeTasks(1))
    const opener = await tabTo(user, 'button', 'New task')
    await user.keyboard('{Enter}')
    expect(within(dialog()).getByLabelText('Title')).toHaveFocus()
    await user.keyboard('Typed by keyboard')
    await user.tab()
    expect(within(dialog()).getByLabelText('Description')).toHaveFocus()
    await user.keyboard('Some text')
    await user.tab()
    expect(within(dialog()).getByLabelText('Status')).toHaveFocus()
    await user.tab()
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(within(dialog()).getByRole('button', { name: 'Create' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Typed by keyboard')).toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('operates the delete dialog from the keyboard and moves focus to the heading afterwards', async () => {
    const { user } = await startSession(makeTasks(2))
    await tabTo(user, 'button', 'Delete Task 1')
    await user.keyboard('{Enter}')
    expect(dialog()).toHaveAccessibleName('Delete task')
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(within(dialog()).getByRole('button', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument())
    expect(requestCounter.count('DELETE', '/api/tasks/1')).toBe(1)
    expect(screen.getByRole('heading', { name: 'Tasks' })).toHaveFocus()
  })

  it('keeps focus on the heading after deleting the only task (empty state)', async () => {
    const { user } = await startSession(makeTasks(1))
    await tabTo(user, 'button', 'Delete Task 1')
    await user.keyboard('{Enter}')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toHaveFocus()
  })

  it('does not steal focus after a delete when the user has moved it elsewhere', async () => {
    server.use(slow('get', TASKS_URL))
    const { user } = await startSession(makeTasks(2))
    await user.click(screen.getByRole('button', { name: 'Delete Task 1' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const signOut = screen.getByRole('button', { name: 'Sign out' })
    signOut.focus()
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument())
    expect(signOut).toHaveFocus()
  })
})

describe('double activation sends one request per control (AC-6c)', () => {
  it('login, by double click', async () => {
    server.use(slow('get', TASKS_URL))
    const { user } = renderApp(<App />)
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
    await user.dblClick(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Tasks' })
    expect(requestCounter.count('GET', '/api/tasks')).toBe(1)
  })

  it('login, by pressing Enter twice on the focused button', async () => {
    server.use(slow('get', TASKS_URL))
    const { user } = renderApp(<App />)
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus()
    await user.keyboard('{Enter}{Enter}')
    await screen.findByRole('heading', { name: 'Tasks' })
    expect(requestCounter.count('GET', '/api/tasks')).toBe(1)
  })

  it('create, by pressing Enter twice on the focused Create button', async () => {
    const { user } = await startSession(makeTasks(1))
    server.use(slow('post', TASKS_URL))
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'Twice')
    await tabTo(user, 'button', 'Create')
    await user.keyboard('{Enter}{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestCounter.count('POST', '/api/tasks')).toBe(1)
  })

  it('edit, by double click on Save', async () => {
    const { user } = await startSession(makeTasks(1))
    server.use(slow('patch', `${TASKS_URL}/:id`))
    await user.click(screen.getByRole('button', { name: 'Edit Task 1' }))
    const title = within(dialog()).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Edited')
    await user.dblClick(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
    expect(screen.getByText('Edited')).toBeInTheDocument()
  })

  it('delete confirm, by double click', async () => {
    const { user } = await startSession(makeTasks(2))
    server.use(slow('delete', `${TASKS_URL}/:id`))
    await user.click(screen.getByRole('button', { name: 'Delete Task 1' }))
    await user.dblClick(within(dialog()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument())
    expect(requestCounter.count('DELETE', '/api/tasks/1')).toBe(1)
  })

  it('status select, by a second change while the first is in flight', async () => {
    const { user } = await startSession(makeTasks(1))
    server.use(slow('patch', `${TASKS_URL}/:id`))
    const select = screen.getByRole('combobox', { name: 'Status of Task 1' })
    await user.selectOptions(select, 'DONE')
    expect(select).toBeDisabled()
    fireEvent.change(select, { target: { value: 'IN_PROGRESS' } })
    await waitFor(() => expect(select).toBeEnabled())
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
    expect(select).toHaveValue('DONE')
  })
})

describe('credentials stay in memory only (AC-1d)', () => {
  it('a full session writes nothing to localStorage, sessionStorage or cookies', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const cookieSet = vi.spyOn(Document.prototype, 'cookie', 'set')

    const { user } = await startSession(makeTasks(2))

    // create
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(within(dialog()).getByLabelText('Title'), 'Created')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    await screen.findByText('Created')
    // edit
    await user.click(screen.getByRole('button', { name: 'Edit Task 1' }))
    const title = within(dialog()).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Edited')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await screen.findByText('Edited')
    // quick status change
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status of Task 2' }), 'DONE')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status of Task 2' })).toHaveValue('DONE'))
    // delete
    await user.click(screen.getByRole('button', { name: 'Delete Task 2' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Task 2')).not.toBeInTheDocument())
    // sign out
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    expect(setItem).not.toHaveBeenCalled()
    expect(cookieSet).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })
})
