import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog.tsx'

function Harness({ onConfirm = () => {}, pending = false }: { onConfirm?: () => void; pending?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <ConfirmDialog
          title="Delete task"
          message="Delete it?"
          confirmLabel="Delete"
          pending={pending}
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}

describe('ConfirmDialog', () => {
  it('has the dialog role, an accessible name, aria-modal and a description', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete task' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Delete it?')
  })

  it('moves focus into the dialog on open and back to the trigger on Cancel', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape without confirming, and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('calls onConfirm from the Confirm button', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('disables both buttons and ignores Escape while pending', async () => {
    const user = userEvent.setup()
    render(<Harness pending />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  describe('while the confirmed action is pending (jsdom key handling only; real browser focus is checked in stage 7)', () => {
    function PendingHarness() {
      const [pending, setPending] = useState(false)
      return (
        <div>
          <button type="button">Outside before</button>
          <ConfirmDialog
            title="Delete task"
            message="Delete it?"
            confirmLabel="Delete"
            pending={pending}
            onConfirm={() => setPending(true)}
            onCancel={() => {}}
          />
          <button type="button">Outside after</button>
        </div>
      )
    }

    async function confirmAndHold() {
      const user = userEvent.setup()
      render(<PendingHarness />)
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
      expect(screen.getByRole('dialog')).toHaveFocus()
      return user
    }

    it('Tab keeps focus on the dialog', async () => {
      const user = await confirmAndHold()
      await user.tab()
      expect(screen.getByRole('dialog')).toHaveFocus()
      await user.tab()
      expect(screen.getByRole('dialog')).toHaveFocus()
    })

    it('Shift+Tab keeps focus on the dialog', async () => {
      const user = await confirmAndHold()
      await user.tab({ shift: true })
      expect(screen.getByRole('dialog')).toHaveFocus()
    })
  })
})
