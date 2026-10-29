import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { GENERIC_ERROR_MESSAGE, NOT_FOUND_MESSAGE } from '../api/errors.ts'
import type { Task } from '../api/types.ts'
import {
  TASKS_URL,
  TEST_CREDENTIALS,
  dbTasks,
  makeTask,
  makeTasks,
  problemResponse,
  resetDb,
  validationResponse,
} from '../test/handlers.ts'
import { renderApp } from '../test/render.tsx'
import { requestCounter, server } from '../test/server.ts'

async function loginWith(tasks: Task[]) {
  resetDb(tasks)
  const view = renderApp(<App />)
  await view.user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
  await view.user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
  await view.user.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Tasks' })
  return view
}

function dialog() {
  return screen.getByRole('dialog')
}

function field(label: string) {
  return within(dialog()).getByLabelText(label)
}

/** Records the JSON bodies of requests to a method. */
type StartListener = Parameters<typeof server.events.on<'request:start'>>[1]
const listeners: StartListener[] = []

afterEach(() => {
  for (const listener of listeners.splice(0)) server.events.removeListener('request:start', listener)
})

function captureBodies(method: 'post' | 'patch') {
  const bodies: Record<string, unknown>[] = []
  const listener: StartListener = ({ request }) => {
    if (request.method.toLowerCase() === method) {
      void request
        .clone()
        .json()
        .then((body: unknown) => bodies.push(body as Record<string, unknown>))
    }
  }
  listeners.push(listener)
  server.events.on('request:start', listener)
  return bodies
}

describe('create', () => {
  it('opens from New task, blocks an empty title with no request, and Escape sends nothing', async () => {
    const { user } = await loginWith(makeTasks(1))
    const opener = screen.getByRole('button', { name: 'New task' })
    await user.click(opener)
    expect(field('Title')).toHaveFocus()
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(requestCounter.count('POST', '/api/tasks')).toBe(0)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(requestCounter.count('POST', '/api/tasks')).toBe(0)
  })

  it('omits an empty description, sends the chosen status, and shows the new task on the last page', async () => {
    const { user } = await loginWith(makeTasks(2))
    // Page size 2 so the new task lands on page 2.
    const size = screen.getByLabelText('Page size')
    await user.clear(size)
    await user.type(size, '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText('Page 1 of 1')

    const bodies = captureBodies('post')
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), '  Brand new  ')
    await user.selectOptions(field('Status'), 'IN_PROGRESS')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await screen.findByText('Page 2 of 2')
    expect(screen.getByText('Brand new')).toBeInTheDocument()
    expect(bodies).toEqual([{ title: 'Brand new', status: 'IN_PROGRESS' }])
    expect(bodies[0]).not.toHaveProperty('description')
  })

  it('sends a non-empty description', async () => {
    const { user } = await loginWith([])
    const bodies = captureBodies('post')
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'With text')
    await user.type(field('Description'), 'Details')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodies).toEqual([{ title: 'With text', description: 'Details', status: 'TODO' }])
    expect(await screen.findByText('With text')).toBeInTheDocument()
  })

  it('sends one POST on double activation and disables submit in flight', async () => {
    server.use(
      http.post(TASKS_URL, async () => {
        await delay(100)
        return HttpResponse.json(makeTask({ id: 9, title: 'Slow' }), { status: 201 })
      }),
    )
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'Slow')
    await user.dblClick(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(within(dialog()).getByRole('button', { name: 'Create' })).toBeDisabled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestCounter.count('POST', '/api/tasks')).toBe(1)
  })

  it('shows 400 errors[] against matching fields and keeps the form open', async () => {
    server.use(
      http.post(TASKS_URL, () =>
        validationResponse([
          { field: 'title', message: 'server says bad title' },
          { field: 'description', message: 'server says bad description' },
        ]),
      ),
    )
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('server says bad title')).toBeInTheDocument()
    expect(screen.getByText('server says bad description')).toBeInTheDocument()
    expect(field('Title')).toHaveAccessibleDescription('server says bad title')
    expect(dialog()).toBeInTheDocument()
    expect(field('Title')).toHaveValue('x')
  })

  it('maps a suffixed field name (description.value, status[0]) to its field', async () => {
    server.use(
      http.post(TASKS_URL, () =>
        validationResponse([
          { field: 'description.value', message: 'suffixed description' },
          { field: 'status[0]', message: 'suffixed status' },
        ]),
      ),
    )
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    await screen.findByText('suffixed description')
    expect(field('Description')).toHaveAccessibleDescription('suffixed description')
    expect(field('Status')).toHaveAccessibleDescription('suffixed status')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an unmatched field error as a general message', async () => {
    server.use(http.post(TASKS_URL, () => validationResponse([{ field: 'priority', message: 'unknown thing' }])))
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('unknown thing')
    expect(dialog()).toBeInTheDocument()
  })

  it('shows a detail-only 400 as a general message', async () => {
    server.use(
      http.post(TASKS_URL, () =>
        problemResponse(400, 'Bad Request', 'Request body is missing, malformed or contains an invalid value.'),
      ),
    )
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Request body is missing, malformed or contains an invalid value.',
    )
    expect(dialog()).toBeInTheDocument()
  })

  it('shows a generic message with no raw server text on a 500', async () => {
    server.use(http.post(TASKS_URL, () => new HttpResponse('stack trace secret', { status: 500 })))
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent(GENERIC_ERROR_MESSAGE)
    expect(alert).not.toHaveTextContent('secret')
    expect(dbTasks()).toHaveLength(0)
  })
})

describe('focus management in the form (F4)', () => {
  it('moves focus to the first invalid field after a client-side validation failure', async () => {
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(field('Title')).toHaveFocus()
  })

  it('moves focus to the first invalid field after a server 400 for a later field', async () => {
    server.use(http.post(TASKS_URL, () => validationResponse([{ field: 'description', message: 'bad description' }])))
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    await screen.findByText('bad description')
    await waitFor(() => expect(field('Description')).toHaveFocus())
  })

  it('moves focus to the error alert after a general failure', async () => {
    server.use(http.post(TASKS_URL, () => new HttpResponse('nope', { status: 500 })))
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'x')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    const alert = await within(dialog()).findByRole('alert')
    await waitFor(() => expect(alert).toHaveFocus())
  })

  it('keeps focus inside the dialog (not on body) while the request is pending', async () => {
    server.use(
      http.post(TASKS_URL, async () => {
        await delay(100)
        return HttpResponse.json(makeTask({ id: 9, title: 'Slow' }), { status: 201 })
      }),
    )
    const { user } = await loginWith([])
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(field('Title'), 'Slow')
    await user.click(within(dialog()).getByRole('button', { name: 'Create' }))
    expect(within(dialog()).getByRole('button', { name: 'Create' })).toBeDisabled()
    expect(dialog()).toHaveFocus()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('edit', () => {
  it('does not send a PATCH when a whitespace-padded stored title is left unchanged (F1)', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: '  Padded ' })])
    await user.click(screen.getByRole('button', { name: /^Edit/ }))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(0)
  })

  it('shows the edit result in the current list even if the list was refetched meanwhile (F3)', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch(`${TASKS_URL}/:id`, async () => {
        await gate
        return undefined
      }),
    )
    const { user } = await loginWith(makeTasks(3))
    await user.click(screen.getByRole('button', { name: 'Edit Task 1' }))
    await user.clear(field('Title'))
    await user.type(field('Title'), 'Renamed')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(within(dialog()).getByRole('button', { name: 'Save' })).toBeDisabled()
    // Replace the list data while the PATCH is held: the dialog is modal, so use the reducer path
    // through a second GET triggered by the page-size form (not behind an inert layer in jsdom).
    const size = screen.getByLabelText('Page size')
    await user.clear(size)
    await user.type(size, '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText('Page 1 of 2')
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Renamed')).toBeInTheDocument()
  })

  it('prefills from the task, including a null description', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha', description: null, status: 'DONE' })])
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    expect(dialog()).toHaveAccessibleName('Edit task')
    expect(field('Title')).toHaveValue('Alpha')
    expect(field('Description')).toHaveValue('')
    expect(field('Status')).toHaveValue('DONE')
  })

  it('sends only the changed fields and shows the saved task', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha', description: 'Old text' })])
    const bodies = captureBodies('patch')
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.clear(field('Title'))
    await user.type(field('Title'), 'Beta')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodies).toEqual([{ title: 'Beta' }])
    expect(await screen.findByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Old text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Beta' })).toHaveFocus()
  })

  it('sends null when the description is cleared', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha', description: 'Old text' })])
    const bodies = captureBodies('patch')
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.clear(field('Description'))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodies).toEqual([{ description: null }])
    expect(screen.queryByText('Old text')).not.toBeInTheDocument()
  })

  it('sends status only when the status changed', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha' })])
    const bodies = captureBodies('patch')
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.selectOptions(field('Status'), 'DONE')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(bodies).toEqual([{ status: 'DONE' }])
  })

  it('sends no request and closes the form when nothing changed (null description)', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha', description: null })])
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(0)
  })

  it('blocks a blank title with no request', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha' })])
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.clear(field('Title'))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(0)
  })

  it('Cancel sends nothing and returns focus to the Edit control', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha' })])
    const edit = screen.getByRole('button', { name: 'Edit Alpha' })
    await user.click(edit)
    await user.type(field('Title'), 'zzz')
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(edit).toHaveFocus()
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(0)
  })

  it('keeps the form open on a 400 and maps the suffixed description.value to the Description field', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha' })])
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.click(field('Description'))
    await user.paste('x'.repeat(2000)) // within the client limit; the handler rejects only above 2000
    server.use(
      http.patch(`${TASKS_URL}/:id`, () =>
        validationResponse([{ field: 'description.value', message: 'size must be at most 2000' }]),
      ),
    )
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await screen.findByText('size must be at most 2000')
    expect(field('Description')).toHaveAccessibleDescription('size must be at most 2000')
    expect(dialog()).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('keeps the form open on a detail-only 400 with a general message', async () => {
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha' })])
    server.use(http.patch(`${TASKS_URL}/:id`, () => problemResponse(400, 'Bad Request', 'Bad patch detail.')))
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.selectOptions(field('Status'), 'DONE')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Bad patch detail.')
  })

  it('on 404 closes the form, refreshes the list and shows a no-longer-exists message', async () => {
    const { user } = await loginWith(makeTasks(2))
    await user.click(screen.getByRole('button', { name: 'Edit Task 1' }))
    // Deleted elsewhere after the list was loaded.
    resetDb(makeTasks(2).slice(1))
    await user.type(field('Title'), ' changed')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText(NOT_FOUND_MESSAGE)).toBeInTheDocument()
    await waitFor(() => expect(requestCounter.count('GET', '/api/tasks')).toBe(2))
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument())
    expect(screen.getByText('Task 2')).toBeInTheDocument()
  })

  it('disables submit in flight and sends one PATCH on double activation', async () => {
    server.use(
      http.patch(`${TASKS_URL}/:id`, async () => {
        await delay(100)
        return HttpResponse.json(makeTask({ id: 1, title: 'Renamed' }))
      }),
    )
    const { user } = await loginWith([makeTask({ id: 1, title: 'Alpha' })])
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }))
    await user.type(field('Title'), '2')
    await user.dblClick(within(dialog()).getByRole('button', { name: 'Save' }))
    expect(within(dialog()).getByRole('button', { name: 'Save' })).toBeDisabled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestCounter.count('PATCH', '/api/tasks/1')).toBe(1)
    expect(await screen.findByText('Renamed')).toBeInTheDocument()
  })
})
