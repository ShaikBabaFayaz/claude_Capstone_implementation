import { useId, useState, type FormEvent } from 'react'
import { MAX_PAGE_SIZE, MIN_PAGE_SIZE, isValidPageSize } from './tasksReducer.ts'

interface PageSizeControlProps {
  /** Current page size. The draft follows it when it changes (the control stays mounted). */
  size: number
  /** Called with a valid size only. Invalid input never reaches it, so nothing is sent. */
  onApply: (size: number) => void
}

export const PAGE_SIZE_ERROR = `Page size must be a whole number from ${MIN_PAGE_SIZE} to ${MAX_PAGE_SIZE}.`

export default function PageSizeControl({ size, onApply }: PageSizeControlProps) {
  const [draft, setDraft] = useState(String(size))
  const [error, setError] = useState<string | null>(null)
  // When the applied size changes, reset the draft in place (no remount, so focus is kept).
  const [seenSize, setSeenSize] = useState(size)
  if (seenSize !== size) {
    setSeenSize(size)
    setDraft(String(size))
    setError(null)
  }
  const inputId = useId()
  const errorId = useId()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    const value = /^\d+$/.test(text) ? Number(text) : Number.NaN
    if (!isValidPageSize(value)) {
      setError(PAGE_SIZE_ERROR)
      return
    }
    setError(null)
    if (value !== size) onApply(value)
  }

  return (
    <form className="page-size" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId}>Page size</label>
      <input
        id={inputId}
        inputMode="numeric"
        value={draft}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit">Apply</button>
      {error !== null && (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      )}
    </form>
  )
}
