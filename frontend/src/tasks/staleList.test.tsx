import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { TASKS_URL, TEST_CREDENTIALS, dbTasks, makeTasks, pageOf, resetDb } from '../test/handlers.ts'
import { renderApp } from '../test/render.tsx'
import { requestCounter, server } from '../test/server.ts'

// F-R2-1: a list GET that is in flight when a PATCH succeeds must not overwrite the saved task.
// The GET is held on a gate (no timers). It carries the data as it was BEFORE the PATCH.

async function startSession() {
  resetDb(makeTasks(3))
  const view = renderApp(<App />)
  await view.user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
  await view.user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
  await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Tasks' })
  return view
}

/** Holds the next list GET; its body is the db content at the time the request arrived (old data). */
function holdNextList() {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  let started: () => void = () => {}
  const hasStarted = new Promise<void>((resolve) => (started = resolve))
  server.use(
    http.get(
      TASKS_URL,
      async () => {
        const oldBody = pageOf(
          dbTasks().map((t) => ({ ...t })),
          0,
          2,
        )
        started()
        await gate
        return HttpResponse.json(oldBody)
      },
      { once: true },
    ),
  )
  return { release, hasStarted }
}

async function applyPageSize(user: ReturnType<typeof renderApp>['user'], value: string) {
  const input = screen.getByLabelText('Page size')
  await user.clear(input)
  await user.type(input, value)
  await user.click(screen.getByRole('button', { name: 'Apply' }))
}

describe('a stale in-flight list GET does not overwrite a saved task', () => {
  it('quick status change saved while the list is loading', async () => {
    const { user } = await startSession()
    const held = holdNextList()
    await applyPageSize(user, '2')
    await held.hasStarted
    expect(screen.getByRole('list', { name: 'Tasks' })).toHaveAttribute('aria-busy', 'true')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status of Task 1' }), 'DONE')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status of Task 1' })).toBeEnabled())
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
    expect(screen.getByRole('combobox', { name: 'Status of Task 1' })).toHaveValue('DONE')

    held.release() // the held GET answers with Task 1 still TODO
    await screen.findByText('Page 1 of 2')
    expect(screen.getByRole('combobox', { name: 'Status of Task 1' })).toHaveValue('DONE')
    expect(screen.getByRole('combobox', { name: 'Status of Task 2' })).toHaveValue('TODO')
  })

  it('edit saved while the list is loading', async () => {
    const { user } = await startSession()
    const held = holdNextList()
    await applyPageSize(user, '2')
    await held.hasStarted

    await user.click(screen.getByRole('button', { name: 'Edit Task 1' }))
    const dialog = screen.getByRole('dialog')
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Renamed')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeInTheDocument()

    held.release() // the held GET answers with the title "Task 1"
    await screen.findByText('Page 1 of 2')
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Task 1' })).not.toBeInTheDocument()
  })
})
