export const MAX_TITLE_LENGTH = 255
export const MAX_DESCRIPTION_LENGTH = 2000

export interface TaskValidationErrors {
  title?: string
  description?: string
}

/**
 * Pure client-side validation. The title is trimmed before checking; lengths are JavaScript string
 * lengths. An empty result means the draft may be submitted.
 */
export function validateTask(draft: { title: string; description: string }): TaskValidationErrors {
  const errors: TaskValidationErrors = {}
  const title = draft.title.trim()
  if (title === '') {
    errors.title = 'Title is required.'
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be at most ${MAX_TITLE_LENGTH} characters.`
  }
  if (draft.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`
  }
  return errors
}

export function hasErrors(errors: TaskValidationErrors): boolean {
  return Object.keys(errors).length > 0
}
