import { describe, expect, it } from 'vitest'
import { basicHeader } from './basicHeader.ts'

function decode(header: string): string {
  const binary = atob(header.replace(/^Basic /, ''))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

describe('basicHeader', () => {
  it('encodes ASCII credentials', () => {
    expect(basicHeader({ username: 'user', password: 'pass' })).toBe('Basic dXNlcjpwYXNz')
  })

  it('encodes non-Latin1 text as UTF-8', () => {
    const header = basicHeader({ username: 'usér', password: 'пароль-密码' })
    expect(header.startsWith('Basic ')).toBe(true)
    expect(decode(header)).toBe('usér:пароль-密码')
  })

  it('keeps colons in the password', () => {
    expect(decode(basicHeader({ username: 'u', password: 'a:b' }))).toBe('u:a:b')
  })
})
