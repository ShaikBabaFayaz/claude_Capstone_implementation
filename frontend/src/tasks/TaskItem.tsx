import { useId } from 'react'
import { TASK_STATUSES, type Task, type TaskStatus } from '../api/types.ts'
import { STATUS_LABELS, formatUpdated } from './taskFormat.ts'

interface TaskItemProps {
  task: Task
  /** True while this task's status change is in flight: the select is disabled. */
  statusPending: boolean
  onStatusChange: (task: Task, status: TaskStatus) => void
  /** Delete trigger is shown only when provided. */
  onDelete?: (task: Task) => void
  /** Edit trigger is shown only when provided. */
  onEdit?: (task: Task) => void
}

export default function TaskItem({ task, statusPending, onStatusChange, onDelete, onEdit }: TaskItemProps) {
  const selectId = useId()
  const hasDescription = task.description !== null && task.description !== ''
  return (
    <li className="task-item">
      <div className="task-header">
        <h2 className="task-title">{task.title}</h2>
        <span className="status-badge" data-status={task.status}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>
      {hasDescription && <p className="task-description">{task.description}</p>}
      <p className="task-meta">
        Updated <time dateTime={task.updatedAt}>{formatUpdated(task.updatedAt)}</time>
      </p>
      <div className="task-actions">
        <label htmlFor={selectId}>Status of {task.title}</label>
        <select
          id={selectId}
          value={task.status}
          disabled={statusPending}
          onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.focus() // the form returns focus here on close
              onEdit(task)
            }}
          >
            Edit {task.title}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="danger"
            onClick={(e) => {
              e.currentTarget.focus() // some browsers do not focus a clicked button; the dialog returns here
              onDelete(task)
            }}
          >
            Delete {task.title}
          </button>
        )}
      </div>
    </li>
  )
}
