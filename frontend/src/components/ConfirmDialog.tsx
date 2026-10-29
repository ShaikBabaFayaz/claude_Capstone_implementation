import { useEffect, useId, useRef, type KeyboardEvent } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  /** True while the confirmed action is in flight: both buttons are disabled (focus is parked on the dialog). */
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal confirmation. Custom div (not native dialog: jsdom has no reliable showModal).
 * Focus moves to Cancel on open and returns to the opener on close. Escape and Cancel only call
 * onCancel; they never send a request themselves.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => {
      if (opener !== null && opener.isConnected) opener.focus()
    }
  }, [])

  // Document level so Escape works even if focus was lost (a disabled button drops focus).
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pending, onCancel])

  // Keep Tab inside the dialog. While pending both buttons are disabled and focus sits on the dialog
  // container: Tab and Shift+Tab are cancelled there so focus cannot leave. (jsdom tests cover the
  // key handling only; real browser focus behaviour is checked manually in stage 7.)
  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    const buttons = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (first === undefined || last === undefined) {
      event.preventDefault() // nothing enabled to move to: stay where focus is, inside the dialog
      dialog?.focus()
    } else if (document.activeElement === dialog) {
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

  function handleConfirm() {
    // The buttons are about to be disabled: park focus on the dialog so it is not dropped to the
    // page body. trapTab keeps Tab and Shift+Tab on the dialog while the request is pending.
    if (!pending && document.activeElement instanceof HTMLButtonElement) dialogRef.current?.focus()
    onConfirm()
  }

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={messageId}>{message}</p>
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="danger" disabled={pending} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
