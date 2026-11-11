import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { ALREADY_DELETED_MESSAGE, GENERIC_ERROR_MESSAGE } from '../api/errors.ts'
import {
  TASKS_URL,
  TEST_CREDENTIALS,
  dbTasks,
  makeTasks,
  problemResponse,
  resetDb,
} from '../test/handlers.ts'
import { renderApp } from '../test/render.tsx'
import { requestCounter, server } from '../test/server.ts'

async function loginAndShowList(count: number) {
  resetDb(makeTasks(count))
  const view = renderApp(<App />)
  await view.user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
  await view.user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
  await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Tasks' })
  return view
}

function deleteTrigger(title: string) {
  return screen.getByRole('button', { name: `Delete ${title}` })
}

function confirmButton() {
  return within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })
}

describe('delete flow', () => {
  it('opens a confirmation dialog and sends no request on Cancel; focus returns to the trigger', async () => {
    const { user } = await loginAndShowList(2)
    const trigger = deleteTrigger('Task 1')
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Delete task' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(requestCounter.count('DELETE', '/api/tasks/1')).toBe(0)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })

  it('sends no request on Escape', async () => {
    const { user } = await loginAndShowList(2)
    await user.click(deleteTrigger('Task 2'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requestCounter.count('DELETE', '/api/tasks/2')).toBe(0)
    expect(dbTasks()).toHaveLength(2)
  })

  it('sends exactly one DELETE when Confirm is activated twice, and removes the task on 204', async () => {
    server.use(
      http.delete(`${TASKS_URL}/:id`, async () => {
        await delay(100)
        return undefined
      }),
    )
    const { user } = await loginAndShowList(2)
    await user.click(deleteTrigger('Task 1'))
    await user.dblClick(confirmButton())
    expect(confirmButton()).toBeDisabled()
    expect(screen.getByRole('dialog')).toHaveFocus() // focus parked on the dialog, not dropped to body
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument())
    expect(requestCounter.count('DELETE', '/api/tasks/1')).toBe(1)
    expect(screen.getByText('Task 2')).toBeInTheDocument()
    expect(dbTasks().map((t) => t.id)).toEqual([2])
  })

  it('loads the previous page after deleting the last item of a page above 0', async () => {
    const { user } = await loginAndShowList(3)
    const input = screen.getByLabelText('Page size')
    await user.clear(input)
    await user.type(input, '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText('Page 1 of 2')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 2')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    await user.click(deleteTrigger('Task 3'))
    await user.click(confirmButton())
    await screen.findByText('Page 1 of 1')
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
    expect(screen.queryByText('Task 3')).not.toBeInTheDocument()
    expect(screen.queryByText('No tasks yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state after deleting the last item on page 0', async () => {
    const { user } = await loginAndShowList(1)
    await user.click(deleteTrigger('Task 1'))
    await user.click(confirmButton())
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('treats a 404 as already deleted: shows a message and refreshes the list', async () => {
    const { user } = await loginAndShowList(2)
    server.use(http.delete(`${TASKS_URL}/:id`, () => problemResponse(404, 'Not Found', 'Task not found.')))
    expect(requestCounter.count('GET', '/api/tasks')).toBe(1)
    await user.click(deleteTrigger('Task 1'))
    await user.click(confirmButton())
    await screen.findByText(ALREADY_DELETED_MESSAGE)
    await waitFor(() => expect(requestCounter.count('GET', '/api/tasks')).toBe(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a generic error and keeps the task when the delete fails', async () => {
    server.use(http.delete(`${TASKS_URL}/:id`, () => new HttpResponse('internal secret', { status: 500 })))
    const { user } = await loginAndShowList(2)
    await user.click(deleteTrigger('Task 1'))
    await user.click(confirmButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(alert).not.toHaveTextContent('secret')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })
})
