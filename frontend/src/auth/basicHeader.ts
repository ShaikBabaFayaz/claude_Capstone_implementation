import type { Credentials } from '../api/types.ts'

/** Builds `Basic <base64(utf8(username:password))>`. Encodes as UTF-8 first so non-Latin1 text works. */
export function basicHeader({ username, password }: Credentials): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return `Basic ${btoa(binary)}`
}
