import { act, screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { GENERIC_ERROR_MESSAGE, NOT_FOUND_MESSAGE } from '../api/errors.ts'
import {
  TASKS_URL,
  TEST_CREDENTIALS,
  makeTask,
  makeTasks,
  problemResponse,
  resetDb,
} from '../test/handlers.ts'
import { renderApp } from '../test/render.tsx'
import { requestCounter, server } from '../test/server.ts'
import { PAGE_SIZE_ERROR } from './PageSizeControl.tsx'

type User = ReturnType<typeof renderApp>['user']

async function loginAndShowList(initial = makeTasks(3)) {
  resetDb(initial)
  const view = renderApp(<App />)
  await view.user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
  await view.user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
  await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Tasks' })
  return view
}

async function setPageSize(user: User, value: string) {
  const input = screen.getByLabelText('Page size')
  await user.clear(input)
  await user.type(input, value)
  await user.click(screen.getByRole('button', { name: 'Apply' }))
}

function statusSelect(title: string) {
  return screen.getByRole('combobox', { name: `Status of ${title}` })
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

describe('TasksPage list', () => {
  it('shows title, status, description only when present, and local updated time, in API order', async () => {
    const tasks = [
      makeTask({ id: 5, title: 'Zebra', description: 'Has a description', status: 'DONE', updatedAt: '2026-03-04T15:30:00Z' }),
      makeTask({ id: 2, title: 'Apple', description: null, status: 'IN_PROGRESS' }),
      makeTask({ id: 9, title: 'Mango', description: '', status: 'TODO' }),
    ]
    await loginAndShowList(tasks)

    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => within(li).getByRole('heading').textContent)).toEqual(['Zebra', 'Apple', 'Mango'])

    expect(within(items[0]).getByText('Has a description')).toBeInTheDocument()
    expect(items[1].querySelector('.task-description')).toBeNull()
    expect(items[2].querySelector('.task-description')).toBeNull()

    expect(statusSelect('Zebra')).toHaveValue('DONE')
    expect(statusSelect('Apple')).toHaveValue('IN_PROGRESS')
    expect(statusSelect('Mango')).toHaveValue('TODO')

    expect(within(items[0]).getByText(timeFormat.format(new Date('2026-03-04T15:30:00Z')))).toBeInTheDocument()
  })

  it('shows a status badge with the status text and a status hook for styling', async () => {
    await loginAndShowList([
      makeTask({ id: 1, title: 'A', status: 'TODO' }),
      makeTask({ id: 2, title: 'B', status: 'IN_PROGRESS' }),
      makeTask({ id: 3, title: 'C', status: 'DONE' }),
    ])
    const items = screen.getAllByRole('listitem')
    const badges = items.map((li) => li.querySelector('.status-badge'))
    expect(badges.map((b) => b?.textContent)).toEqual(['To do', 'In progress', 'Done'])
    expect(badges.map((b) => b?.getAttribute('data-status'))).toEqual(['TODO', 'IN_PROGRESS', 'DONE'])
  })

  it('makes no request beyond the login probe when the list first appears', async () => {
    await loginAndShowList()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0)) // yield to any queued request
    })
    expect(requestCounter.total()).toBe(1)
  })

  it('shows the empty state when there are no tasks', async () => {
    await loginAndShowList([])
    expect(screen.getByText('No tasks yet.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('disables Previous on the first page and Next on the last page', async () => {
    const { user } = await loginAndShowList(makeTasks(5))
    await setPageSize(user, '2')
    await screen.findByText('Page 1 of 3')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 3')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 3 of 3')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('Page 2 of 3')
  })

  it('sends a valid page size and shows that many tasks per page, resetting to page 1', async () => {
    const { user } = await loginAndShowList(makeTasks(5))
    await setPageSize(user, '2')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(requestCounter.count('GET', '/api/tasks')).toBe(2)
  })

  it.each(['0', '101', '-3', '1.5', 'abc', ''])('blocks the invalid page size %j without a request', async (value) => {
    const { user } = await loginAndShowList()
    const before = requestCounter.total()
    const input = screen.getByLabelText('Page size')
    await user.clear(input)
    if (value !== '') await user.type(input, value)
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent(PAGE_SIZE_ERROR)
    expect(requestCounter.total()).toBe(before)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('accepts the boundary sizes 1 and 100', async () => {
    const { user } = await loginAndShowList(makeTasks(3))
    await setPageSize(user, '1')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    await setPageSize(user, '100')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a loading state while a page loads', async () => {
    server.use(
      http.get(TASKS_URL, async () => {
        await delay(150)
        return undefined
      }),
    )
    const { user } = await loginAndShowList(makeTasks(5))
    await setPageSize(user, '2')
    expect(await screen.findByText('Loading tasks…')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument())
  })

  it('shows a generic error with Retry for a non-401 failure, then recovers on Retry', async () => {
    const { user } = await loginAndShowList(makeTasks(5))
    server.use(http.get(TASKS_URL, () => new HttpResponse('boom: internal detail', { status: 500 }), { once: true }))
    await setPageSize(user, '2')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(alert).not.toHaveTextContent('boom')
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('signs out from the sign-out control and shows the login form', async () => {
    const { user } = await loginAndShowList()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument()
  })
})

describe('TasksPage quick status change', () => {
  it('sends a PATCH with a body of exactly {"status": value} and shows the new status after 200', async () => {
    let body: unknown
    server.use(
      http.patch(`${TASKS_URL}/:id`, async ({ request }) => {
        body = await request.clone().json()
        return undefined
      }),
    )
    const { user } = await loginAndShowList(makeTasks(2))
    await user.selectOptions(statusSelect('Task 1'), 'DONE')
    await waitFor(() => expect(statusSelect('Task 1')).toHaveValue('DONE'))
    expect(body).toEqual({ status: 'DONE' })
    expect(Object.keys(body as object)).toEqual(['status'])
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
    expect(statusSelect('Task 2')).toHaveValue('TODO')
  })

  it('disables the control while in flight, keeps the old status until 200, and sends one request', async () => {
    server.use(
      http.patch(`${TASKS_URL}/:id`, async () => {
        await delay(150)
        return undefined
      }),
    )
    const { user } = await loginAndShowList(makeTasks(1))
    await user.selectOptions(statusSelect('Task 1'), 'IN_PROGRESS')
    expect(statusSelect('Task 1')).toBeDisabled()
    expect(statusSelect('Task 1')).toHaveValue('TODO')
    await waitFor(() => expect(statusSelect('Task 1')).toBeEnabled())
    expect(statusSelect('Task 1')).toHaveValue('IN_PROGRESS')
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
  })

  it('shows the saved status even when the list was replaced while the PATCH was in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch(`${TASKS_URL}/:id`, async () => {
        await gate
        return undefined // fall through to the default handler
      }),
    )
    const { user } = await loginAndShowList(makeTasks(3))
    await user.selectOptions(statusSelect('Task 1'), 'DONE')
    expect(statusSelect('Task 1')).toBeDisabled()

    // Replace the list data (page-size change) while the PATCH is held.
    await setPageSize(user, '2')
    await screen.findByText('Page 1 of 2')
    await waitFor(() => expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument())
    expect(statusSelect('Task 1')).toHaveValue('TODO')

    release()
    await waitFor(() => expect(statusSelect('Task 1')).toBeEnabled())
    expect(statusSelect('Task 1')).toHaveValue('DONE')
  })

  it('shows a generic error and keeps the previous status when the change fails', async () => {
    server.use(http.patch(`${TASKS_URL}/:id`, () => new HttpResponse('secret server text', { status: 500 })))
    const { user } = await loginAndShowList(makeTasks(1))
    await user.selectOptions(statusSelect('Task 1'), 'DONE')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(alert).not.toHaveTextContent('secret')
    expect(statusSelect('Task 1')).toHaveValue('TODO')
    expect(statusSelect('Task 1')).toBeEnabled()
  })

  it('on 404 shows a message, keeps the status and refreshes the list', async () => {
    server.use(http.patch(`${TASKS_URL}/:id`, () => problemResponse(404, 'Not Found', 'Task not found.')))
    const { user } = await loginAndShowList(makeTasks(2))
    expect(requestCounter.count('GET', '/api/tasks')).toBe(1)
    await user.selectOptions(statusSelect('Task 1'), 'DONE')
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_FOUND_MESSAGE)
    await waitFor(() => expect(requestCounter.count('GET', '/api/tasks')).toBe(2))
    await waitFor(() => expect(screen.queryByText('Loading tasks…')).not.toBeInTheDocument())
    expect(statusSelect('Task 1')).toHaveValue('TODO')
  })
})
