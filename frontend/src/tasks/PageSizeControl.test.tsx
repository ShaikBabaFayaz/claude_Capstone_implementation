import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PageSizeControl from './PageSizeControl.tsx'

describe('PageSizeControl draft', () => {
  it('resets a typed draft to the new applied size when the size prop changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PageSizeControl size={20} onApply={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Page size' })
    await user.clear(input)
    await user.type(input, '7') // draft differs from both the old (20) and the new (5) size
    expect(input).toHaveValue('7')

    rerender(<PageSizeControl size={5} onApply={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Page size' })).toBe(input) // same element: not remounted
    expect(input).toHaveValue('5')
  })

  it('clears a validation error when the applied size changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PageSizeControl size={20} onApply={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Page size' })
    await user.clear(input)
    await user.type(input, '0')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<PageSizeControl size={5} onApply={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).toHaveValue('5')
  })

  it('keeps the draft when the same size is rendered again', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PageSizeControl size={20} onApply={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Page size' })
    await user.clear(input)
    await user.type(input, '7')
    rerender(<PageSizeControl size={20} onApply={vi.fn()} />)
    expect(input).toHaveValue('7')
  })
})
