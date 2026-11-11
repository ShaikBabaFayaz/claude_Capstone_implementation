import { createContext } from 'react'
import type { ApiClient } from '../api/client.ts'
import type { Credentials, Page, Task } from '../api/types.ts'

export type SignInResult = { ok: true } | { ok: false; reason: 'invalid' | 'failed' | 'aborted' }

export interface AuthContextValue {
  isAuthenticated: boolean
  /** First page returned by the login probe. Read once by useTasks for its initial state. */
  seed: Page<Task> | null
  client: ApiClient
  signIn: (credentials: Credentials) => Promise<SignInResult>
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
