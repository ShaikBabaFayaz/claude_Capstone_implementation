import { describe, expect, it } from 'vitest'
import type { TaskDraft } from '../api/types.ts'
import { makeTask } from '../test/handlers.ts'
import { buildPatch, isEmptyPatch } from './buildPatch.ts'

function draftOf(task: ReturnType<typeof makeTask>, changes: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    ...changes,
  }
}

describe('buildPatch', () => {
  it('returns an empty patch when nothing changed', () => {
    const task = makeTask({ description: 'text' })
    const patch = buildPatch(task, draftOf(task))
    expect(patch).toEqual({})
    expect(isEmptyPatch(patch)).toBe(true)
  })

  it('sends changed fields only', () => {
    const task = makeTask({ description: 'text' })
    expect(buildPatch(task, draftOf(task, { title: 'Other' }))).toEqual({ title: 'Other' })
    expect(buildPatch(task, draftOf(task, { status: 'DONE' }))).toEqual({ status: 'DONE' })
    expect(buildPatch(task, draftOf(task, { description: 'new' }))).toEqual({ description: 'new' })
  })

  it('sends only the status for a quick status change', () => {
    const task = makeTask({ description: 'text' })
    expect(buildPatch(task, draftOf(task, { status: 'IN_PROGRESS' }))).toEqual({ status: 'IN_PROGRESS' })
  })

  it('sends null when a non-empty description is cleared', () => {
    const task = makeTask({ description: 'text' })
    expect(buildPatch(task, draftOf(task, { description: '' }))).toEqual({ description: null })
  })

  it('treats null to empty as no change', () => {
    const task = makeTask({ description: null })
    const patch = buildPatch(task, draftOf(task))
    expect(patch).toEqual({})
    expect(isEmptyPatch(patch)).toBe(true)
  })

  it('sends the text when an empty description gets text', () => {
    const task = makeTask({ description: null })
    expect(buildPatch(task, draftOf(task, { description: 'hello' }))).toEqual({ description: 'hello' })
    const emptyString = makeTask({ description: '' })
    expect(buildPatch(emptyString, draftOf(emptyString, { description: 'hello' }))).toEqual({
      description: 'hello',
    })
  })

  it('ignores trailing whitespace on an otherwise unchanged title', () => {
    const task = makeTask({ title: 'Same' })
    expect(buildPatch(task, draftOf(task, { title: 'Same   ' }))).toEqual({})
  })

  it('does not rewrite a whitespace-padded stored title on a status-only change', () => {
    const task = makeTask({ title: '  Foo ' })
    expect(buildPatch(task, draftOf(task, { status: 'DONE' }))).toEqual({ status: 'DONE' })
  })

  it('is a no-op when a whitespace-padded stored title is left unchanged', () => {
    const task = makeTask({ title: '  Foo ' })
    expect(isEmptyPatch(buildPatch(task, draftOf(task)))).toBe(true)
    expect(isEmptyPatch(buildPatch(task, draftOf(task, { title: 'Foo' })))).toBe(true)
  })

  it('sends the trimmed title when the title really changed', () => {
    const task = makeTask({ title: 'Old' })
    expect(buildPatch(task, draftOf(task, { title: '  New  ' }))).toEqual({ title: 'New' })
  })

  it('can change several fields at once', () => {
    const task = makeTask({ description: 'text' })
    expect(
      buildPatch(task, { title: 'T2', description: '', status: 'DONE' }),
    ).toEqual({ title: 'T2', description: null, status: 'DONE' })
  })
})
