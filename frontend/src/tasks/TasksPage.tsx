import { useCallback, useEffect, useRef, useState } from 'react'
import { ALREADY_DELETED_MESSAGE, messageFor, NOT_FOUND_MESSAGE } from '../api/errors.ts'
import type { Page, Task, TaskDraft, TaskPatch, TaskStatus } from '../api/types.ts'
import { useAuth } from '../auth/useAuth.ts'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import { buildPatch, isEmptyPatch } from './buildPatch.ts'
import TaskForm, { type FormOutcome } from './TaskForm.tsx'
import Pagination from './Pagination.tsx'
import PageSizeControl from './PageSizeControl.tsx'
import TaskList from './TaskList.tsx'
import { useTasks } from './useTasks.ts'

interface Notice {
  kind: 'error' | 'info'
  text: string
}

export default function TasksPage() {
  const { client, seed, signOut } = useAuth()
  const tasks = useTasks(client, seed)
  const { refetch, taskUpdated } = tasks

  const [notice, setNotice] = useState<Notice | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(() => new Set())
  const statusInFlight = useRef(new Set<number>())

  function changeStatus(task: Task, status: TaskStatus) {
    if (statusInFlight.current.has(task.id)) return
    statusInFlight.current.add(task.id)
    setPendingIds(new Set(statusInFlight.current))
    setNotice(null)

    void client.patchTask(task.id, { status }).then((result) => {
      statusInFlight.current.delete(task.id)
      if (!result.ok && result.error.kind === 'aborted') return // signed out or unmounted
      setPendingIds(new Set(statusInFlight.current))
      if (result.ok) {
        taskUpdated(result.value)
        return
      }
      // Failure: the previous status stays on screen (the row is only replaced after a 200).
      if (result.error.kind === 'notFound') {
        setNotice({ kind: 'error', text: NOT_FOUND_MESSAGE })
        refetch()
      } else {
        setNotice({ kind: 'error', text: messageFor(result.error) })
      }
    })
  }

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deleteInFlight = useRef(false)

  const cancelDelete = useCallback(() => setDeleteTarget(null), [])

  // After a delete the opener row is gone, so focus would fall to the page body. Once the refetch
  // has settled, move it to the page heading (only if nothing else holds focus).
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusAfterDelete = useRef<{ base: Page<Task> | null } | null>(null)
  useEffect(() => {
    const pending = focusAfterDelete.current
    if (pending === null || tasks.status === 'loading') return
    if (tasks.status === 'ready' && tasks.data === pending.base) return
    focusAfterDelete.current = null
    const active = document.activeElement
    if (active === null || active === document.body) headingRef.current?.focus()
  }, [tasks.status, tasks.data])

  function confirmDelete() {
    if (deleteTarget === null || deleteInFlight.current) return
    deleteInFlight.current = true
    setDeleting(true)
    setNotice(null)
    const target = deleteTarget

    void client.deleteTask(target.id).then((result) => {
      deleteInFlight.current = false
      if (!result.ok && result.error.kind === 'aborted') return // signed out or unmounted
      setDeleting(false)
      setDeleteTarget(null)
      if (result.ok || result.error.kind === 'notFound') focusAfterDelete.current = { base: tasks.data }
      if (result.ok) {
        // Reload the current page. An empty result on a page above 0 steps back to the previous
        // page inside useTasks; on page 0 the empty state is shown.
        refetch()
      } else if (result.error.kind === 'notFound') {
        setNotice({ kind: 'info', text: ALREADY_DELETED_MESSAGE })
        refetch()
      } else {
        setNotice({ kind: 'error', text: messageFor(result.error) })
      }
    })
  }

  // Create / edit form. `null` = closed; `{ task: null }` = create; `{ task }` = edit.
  const [formTarget, setFormTarget] = useState<{ task: Task | null } | null>(null)
  const formInFlight = useRef(false)

  const closeForm = useCallback(() => setFormTarget(null), [])

  async function submitForm(draft: TaskDraft): Promise<FormOutcome> {
    if (formTarget === null || formInFlight.current) return { kind: 'aborted' }
    const target = formTarget.task

    let patch: TaskPatch = {}
    if (target !== null) {
      patch = buildPatch(target, draft)
      if (isEmptyPatch(patch)) {
        // Nothing changed: no request; the form closes.
        setFormTarget(null)
        return { kind: 'done' }
      }
    }

    formInFlight.current = true
    setNotice(null)
    const result =
      target === null
        ? await client.createTask({
            title: draft.title.trim(),
            ...(draft.description === '' ? {} : { description: draft.description }),
            status: draft.status,
          })
        : await client.patchTask(target.id, patch)
    formInFlight.current = false

    if (result.ok) {
      setFormTarget(null)
      if (target === null) {
        tasks.goToLastPage()
      } else {
        taskUpdated(result.value)
      }
      return { kind: 'done' }
    }

    const error = result.error
    if (error.kind === 'aborted') return { kind: 'aborted' } // signed out or unmounted
    if (error.kind === 'notFound' && target !== null) {
      setFormTarget(null)
      setNotice({ kind: 'error', text: NOT_FOUND_MESSAGE })
      refetch()
      return { kind: 'done' }
    }
    if (error.kind === 'validation') {
      return { kind: 'invalid', fieldErrors: error.fieldErrors, general: error.general }
    }
    return { kind: 'failed', message: messageFor(error) }
  }

  const data = tasks.data
  const rows = data === null ? [] : data.content
  const loading = tasks.status === 'loading'

  let body
  if (tasks.status === 'error') {
    body = (
      <div className="state state-error">
        <p role="alert">{tasks.error ? messageFor(tasks.error) : 'Something went wrong. Please try again.'}</p>
        <button type="button" onClick={refetch}>
          Retry
        </button>
      </div>
    )
  } else if (data === null) {
    body = (
      <p role="status" className="state">
        Loading tasks…
      </p>
    )
  } else if (rows.length === 0 && !loading) {
    body = (
      <p role="status" className="state">
        No tasks yet.
      </p>
    )
  } else {
    body = (
      <>
        {loading && (
          <p role="status" className="state">
            Loading tasks…
          </p>
        )}
        <TaskList
          tasks={rows}
          busy={loading}
          pendingIds={pendingIds}
          onStatusChange={changeStatus}
          onDelete={setDeleteTarget}
          onEdit={(task) => setFormTarget({ task })}
        />
      </>
    )
  }

  return (
    <main className="tasks-page">
      <header className="page-header">
        <h1 ref={headingRef} tabIndex={-1}>
          Tasks
        </h1>
        <div className="header-actions">
          <button
            type="button"
            className="primary"
            onClick={(e) => {
              e.currentTarget.focus() // the form returns focus here on close
              setFormTarget({ task: null })
            }}
          >
            New task
          </button>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      {notice !== null && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`notice notice-${notice.kind}`}>
          {notice.text}
        </p>
      )}
      <PageSizeControl size={tasks.size} onApply={tasks.setSize} />
      {body}
      {data !== null && tasks.status !== 'error' && (
        <Pagination page={data.page} totalPages={data.totalPages} onPage={tasks.setPage} />
      )}
      {formTarget !== null && (
        <TaskForm
          key={formTarget.task?.id ?? 'new'}
          task={formTarget.task}
          onSubmit={submitForm}
          onCancel={closeForm}
        />
      )}
      {deleteTarget !== null && (
        <ConfirmDialog
          title="Delete task"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          pending={deleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </main>
  )
}
