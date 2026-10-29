import { describe, expect, it } from 'vitest'
import { hasErrors, validateTask } from './validate.ts'

const ok = { title: 'A title', description: '' }

describe('validateTask', () => {
  it('accepts a valid draft', () => {
    expect(validateTask(ok)).toEqual({})
    expect(hasErrors(validateTask(ok))).toBe(false)
  })

  it('blocks an empty and a whitespace-only title', () => {
    expect(validateTask({ ...ok, title: '' }).title).toBeDefined()
    expect(validateTask({ ...ok, title: '   \t ' }).title).toBeDefined()
  })

  it('allows 255 and blocks 256 title characters', () => {
    expect(validateTask({ ...ok, title: 'x'.repeat(255) }).title).toBeUndefined()
    expect(validateTask({ ...ok, title: 'x'.repeat(256) }).title).toBeDefined()
  })

  it('trims the title before measuring it', () => {
    expect(validateTask({ ...ok, title: `  ${'x'.repeat(255)}  ` }).title).toBeUndefined()
  })

  it('allows 2000 and blocks 2001 description characters', () => {
    expect(validateTask({ ...ok, description: 'x'.repeat(2000) }).description).toBeUndefined()
    const errors = validateTask({ ...ok, description: 'x'.repeat(2001) })
    expect(errors.description).toBeDefined()
    expect(hasErrors(errors)).toBe(true)
  })

  it('reports both fields at once', () => {
    const errors = validateTask({ title: '', description: 'x'.repeat(2001) })
    expect(Object.keys(errors).sort()).toEqual(['description', 'title'])
  })
})
