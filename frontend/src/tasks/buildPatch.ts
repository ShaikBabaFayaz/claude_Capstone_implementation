import type { Task, TaskDraft, TaskPatch } from '../api/types.ts'

/**
 * Builds a PATCH body with changed fields only.
 * - title: the trimmed draft is compared with the trimmed stored title; the trimmed draft is sent
 *   only when they differ (a stored title with padding is not rewritten by an unrelated edit).
 * - description: `original.description ?? ''` is compared with the form value. Non-empty to empty
 *   sends `null`; null to empty is no change; empty to text sends the text.
 * - status: sent when different.
 * An empty result means no request should be sent.
 */
export function buildPatch(
  original: Pick<Task, 'title' | 'description' | 'status'>,
  draft: TaskDraft,
): TaskPatch {
  const patch: TaskPatch = {}

  const title = draft.title.trim()
  if (title !== original.title.trim()) {
    patch.title = title
  }

  const originalDescription = original.description ?? ''
  if (draft.description !== originalDescription) {
    patch.description = draft.description === '' ? null : draft.description
  }

  if (draft.status !== original.status) {
    patch.status = draft.status
  }

  return patch
}

export function isEmptyPatch(patch: TaskPatch): boolean {
  return Object.keys(patch).length === 0
}
