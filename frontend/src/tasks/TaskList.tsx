import type { Task, TaskStatus } from '../api/types.ts'
import TaskItem from './TaskItem.tsx'

interface TaskListProps {
  tasks: Task[]
  busy: boolean
  pendingIds: ReadonlySet<number>
  onStatusChange: (task: Task, status: TaskStatus) => void
  onDelete?: (task: Task) => void
  onEdit?: (task: Task) => void
}

/** Renders tasks in the order given (the API order); no sorting here. */
export default function TaskList({ tasks, busy, pendingIds, onStatusChange, onDelete, onEdit }: TaskListProps) {
  return (
    <ul className="task-list" aria-label="Tasks" aria-busy={busy}>
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          statusPending={pendingIds.has(task.id)}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </ul>
  )
}
