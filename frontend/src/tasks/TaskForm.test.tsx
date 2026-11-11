import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTask } from '../test/handlers.ts'
import TaskForm, { type FormOutcome } from './TaskForm.tsx'

function setup(
  props: { task?: ReturnType<typeof makeTask> | null; onSubmit?: () => Promise<FormOutcome> } = {},
) {
  const onSubmit = vi.fn(props.onSubmit ?? (() => Promise.resolve<FormOutcome>({ kind: 'done' })))
  const onCancel = vi.fn()
  const user = userEvent.setup()
  const view = render(<TaskForm task={props.task ?? null} onSubmit={onSubmit} onCancel={onCancel} />)
  return { user, onSubmit, onCancel, ...view }
}

describe('TaskForm', () => {
  it('has labelled Title, Description and Status fields, a dialog name, and focuses Title', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'New task' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('TODO')
  })

  it('blocks a missing or blank title with no submit', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    await user.type(screen.getByLabelText('Title'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('blocks a title over 255 characters and a description over 2000, accepts the limits', async () => {
    const { user, onSubmit } = setup()
    const title = screen.getByLabelText('Title')
    const description = screen.getByLabelText('Description')
    await user.click(title)
    await user.paste('a'.repeat(256))
    await user.click(description)
    await user.paste('b'.repeat(2001))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByText('Title must be at most 255 characters.')).toBeInTheDocument()
    expect(screen.getByText('Description must be at most 2000 characters.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(title)
    await user.click(title)
    await user.paste('a'.repeat(255))
    await user.clear(description)
    await user.click(description)
    await user.paste('b'.repeat(2000))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('submits the entered values', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Title'), 'Write docs')
    await user.type(screen.getByLabelText('Description'), 'Some text')
    await user.selectOptions(screen.getByLabelText('Status'), 'DONE')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Write docs', description: 'Some text', status: 'DONE' })
  })

  it('prefills an edit from the task, showing an empty description for null', () => {
    setup({ task: makeTask({ title: 'Old', description: null, status: 'IN_PROGRESS' }) })
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Old')
    expect(screen.getByLabelText('Description')).toHaveValue('')
    expect(screen.getByLabelText('Status')).toHaveValue('IN_PROGRESS')
  })

  it('prefills an existing description', () => {
    setup({ task: makeTask({ description: 'Keep me' }) })
    expect(screen.getByLabelText('Description')).toHaveValue('Keep me')
  })

  it('shows field errors and a general alert from the outcome, and keeps the values', async () => {
    const { user } = setup({
      onSubmit: () =>
        Promise.resolve({
          kind: 'invalid',
          fieldErrors: { title: ['must not be blank'], status: ['bad status'] },
          general: ['Something else is wrong.'],
        }),
    })
    await user.type(screen.getByLabelText('Title'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('must not be blank')).toBeInTheDocument()
    expect(screen.getByText('bad status')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Something else is wrong.')
    expect(screen.getByLabelText('Title')).toHaveValue('x')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('shows a failed outcome as a general alert', async () => {
    const { user } = setup({ onSubmit: () => Promise.resolve({ kind: 'failed', message: 'Boom.' }) })
    await user.type(screen.getByLabelText('Title'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom.')
  })

  it('disables submit while in flight and sends one submit on double activation', async () => {
    let finish: (o: FormOutcome) => void = () => {}
    const { user, onSubmit } = setup({
      onSubmit: () => new Promise<FormOutcome>((resolve) => (finish = resolve)),
    })
    await user.type(screen.getByLabelText('Title'), 'x')
    await user.dblClick(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish({ kind: 'failed', message: 'Nope.' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled())
  })

  it('Cancel and Escape call onCancel and never submit', async () => {
    const { user, onSubmit, onCancel } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('returns focus to the opener on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = setup()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  describe('while a submit is pending (jsdom key handling only; real browser focus is checked in stage 7)', () => {
    async function submitAndHold() {
      const { user } = setup({ onSubmit: () => new Promise<FormOutcome>(() => {}) })
      await user.type(screen.getByLabelText('Title'), 'x')
      await user.click(screen.getByRole('button', { name: 'Create' }))
      expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
      expect(screen.getByRole('dialog')).toHaveFocus()
      return user
    }

    it('Shift+Tab from the dialog goes to the last field, not out of the dialog', async () => {
      const user = await submitAndHold()
      await user.tab({ shift: true })
      expect(screen.getByLabelText('Status')).toHaveFocus()
    })

    it('Tab from the dialog goes to Title, and Tab/Shift+Tab then wrap inside the dialog', async () => {
      const user = await submitAndHold()
      await user.tab()
      expect(screen.getByLabelText('Title')).toHaveFocus()
      await user.tab({ shift: true })
      expect(screen.getByLabelText('Status')).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText('Title')).toHaveFocus()
    })

    it('keeps focus on the dialog when nothing inside is enabled', async () => {
      const { user } = setup()
      const dialog = screen.getByRole('dialog')
      for (const el of Array.from(dialog.querySelectorAll<HTMLElement>('input, textarea, select, button'))) {
        el.setAttribute('disabled', '')
      }
      dialog.focus()
      await user.tab()
      expect(dialog).toHaveFocus()
      await user.tab({ shift: true })
      expect(dialog).toHaveFocus()
    })
  })
})
