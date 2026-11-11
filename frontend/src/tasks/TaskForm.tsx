import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { TASK_STATUSES, type Task, type TaskDraft, type TaskStatus } from '../api/types.ts'
import { STATUS_LABELS } from './taskFormat.ts'
import { hasErrors, validateTask } from './validate.ts'

/** What the owner reports back after trying to save. `done` means the owner closes the form. */
export type FormOutcome =
  | { kind: 'done' }
  | { kind: 'invalid'; fieldErrors: Partial<Record<'title' | 'description' | 'status', string[]>>; general: string[] }
  | { kind: 'failed'; message: string }
  | { kind: 'aborted' }

interface TaskFormProps {
  /** The task being edited, or null to create. */
  task: Task | null
  onSubmit: (draft: TaskDraft) => Promise<FormOutcome>
  onCancel: () => void
}

const DEFAULT_STATUS: TaskStatus = 'TODO'
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

/**
 * Shared create/edit form shown as a modal dialog. Focus moves to Title on open and returns to the
 * opener on close. Escape and Cancel only call onCancel; they never send a request.
 */
export default function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const headingId = useId()
  const titleId = useId()
  const descriptionId = useId()
  const statusId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const statusRef = useRef<HTMLSelectElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const focusErrors = useRef(false)

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? DEFAULT_STATUS)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [general, setGeneral] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    titleRef.current?.focus()
    return () => {
      if (opener !== null && opener.isConnected) opener.focus()
    }
  }, [])

  // Document level so Escape works even if focus was lost.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [submitting, onCancel])

  // Keep Tab inside the dialog. jsdom tests cover the key handling only; real browser focus
  // behaviour is checked manually in stage 7.
  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) {
      event.preventDefault() // nothing enabled to move to: stay inside the dialog
      dialogRef.current?.focus()
    } else if (document.activeElement === dialogRef.current) {
      // Focus parked on the container (request pending): enter the dialog instead of leaving it.
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // After a failed or invalid submit, move focus to the first invalid field, else the error alert.
  useEffect(() => {
    if (!focusErrors.current) return
    focusErrors.current = false
    const invalid = (['title', 'description', 'status'] as const).find((f) => (fieldErrors[f]?.length ?? 0) > 0)
    const target =
      invalid === 'title'
        ? titleRef.current
        : invalid === 'description'
          ? descriptionRef.current
          : invalid === 'status'
            ? statusRef.current
            : alertRef.current
    target?.focus()
  }, [fieldErrors, general])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    const clientErrors = validateTask({ title, description })
    if (hasErrors(clientErrors)) {
      const next: Record<string, string[]> = {}
      if (clientErrors.title) next.title = [clientErrors.title]
      if (clientErrors.description) next.description = [clientErrors.description]
      focusErrors.current = true
      setFieldErrors(next)
      setGeneral([])
      return
    }

    inFlight.current = true
    // The clicked button is about to be disabled: park focus on the dialog so it is not dropped
    // to the page body. trapTab keeps Tab and Shift+Tab inside the dialog while it is pending.
    if (document.activeElement instanceof HTMLButtonElement) dialogRef.current?.focus()
    setSubmitting(true)
    setFieldErrors({})
    setGeneral([])
    const outcome = await onSubmit({ title, description, status })
    inFlight.current = false
    setSubmitting(false)

    if (outcome.kind === 'invalid') {
      focusErrors.current = true
      setFieldErrors(outcome.fieldErrors)
      setGeneral(outcome.general)
    } else if (outcome.kind === 'failed') {
      focusErrors.current = true
      setGeneral([outcome.message])
    } else if (document.activeElement === dialogRef.current) {
      titleRef.current?.focus() // aborted: the form stays open, give focus a real control back
    }
  }

  function fieldProps(field: string, id: string) {
    const invalid = (fieldErrors[field]?.length ?? 0) > 0
    return {
      id,
      'aria-invalid': invalid ? true : undefined,
      'aria-describedby': invalid ? `${id}-error` : undefined,
    }
  }

  function renderErrors(field: string, id: string) {
    const messages = fieldErrors[field]
    if (!messages || messages.length === 0) return null
    return (
      <p id={`${id}-error`} className="field-error">
        {messages.join(' ')}
      </p>
    )
  }

  const heading = task === null ? 'New task' : 'Edit task'

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <h2 id={headingId}>{heading}</h2>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="form-field">
            <label htmlFor={titleId}>Title</label>
            <input
              {...fieldProps('title', titleId)}
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {renderErrors('title', titleId)}
          </div>
          <div className="form-field">
            <label htmlFor={descriptionId}>Description</label>
            <textarea
              {...fieldProps('description', descriptionId)}
              ref={descriptionRef}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {renderErrors('description', descriptionId)}
          </div>
          <div className="form-field">
            <label htmlFor={statusId}>Status</label>
            <select
              {...fieldProps('status', statusId)}
              ref={statusRef}
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {renderErrors('status', statusId)}
          </div>
          {general.length > 0 && (
            <div role="alert" className="form-error" ref={alertRef} tabIndex={-1}>
              {general.map((message, i) => (
                <p key={i}>{message}</p>
              ))}
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" disabled={submitting} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {task === null ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
