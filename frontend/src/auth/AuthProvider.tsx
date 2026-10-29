import { useState, type ReactNode } from 'react'
import { createApiClient } from '../api/client.ts'
import type { Credentials, Page, Task } from '../api/types.ts'
import { basicHeader } from './basicHeader.ts'
import { AuthContext, type AuthContextValue, type SignInResult } from './authContext.ts'

interface AuthProviderProps {
  children: ReactNode
  /** API base URL; default '/api'. Tests pass an absolute URL. */
  baseUrl?: string
}

export function AuthProvider({ children, baseUrl }: AuthProviderProps) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [seed, setSeed] = useState<Page<Task> | null>(null)

  // Credentials live only in this closure (memory). Never in storage, cookies or env variables.
  const [core] = useState(() => {
    const held: { header: string | null } = { header: null }

    const signOut = () => {
      held.header = null
      setSeed(null)
      setAuthenticated(false)
      client.abortAll()
    }

    const client = createApiClient({
      baseUrl,
      getAuthHeader: () => held.header,
      onUnauthorized: signOut,
    })

    const signIn = async (credentials: Credentials): Promise<SignInResult> => {
      const result = await client.probe(credentials)
      if (result.ok) {
        // Commit only after a 200: a failed login leaves no credentials and no seed behind.
        held.header = basicHeader(credentials)
        setSeed(result.value)
        setAuthenticated(true)
        return { ok: true }
      }
      if (result.error.kind === 'unauthorized') return { ok: false, reason: 'invalid' }
      if (result.error.kind === 'aborted') return { ok: false, reason: 'aborted' }
      return { ok: false, reason: 'failed' }
    }

    return { client, signIn, signOut }
  })

  const value: AuthContextValue = {
    isAuthenticated,
    seed,
    client: core.client,
    signIn: core.signIn,
    signOut: core.signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
