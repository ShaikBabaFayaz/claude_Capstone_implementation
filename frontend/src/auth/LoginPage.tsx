import { useRef, useState, type FormEvent } from 'react'
import { GENERIC_ERROR_MESSAGE, INVALID_CREDENTIALS_MESSAGE } from '../api/errors.ts'
import { useAuth } from './useAuth.ts'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setMessage(null)
    const result = await signIn({ username, password })
    inFlight.current = false
    if (result.ok) return // the app switches to the task screen; this page unmounts
    setPending(false)
    if (result.reason === 'invalid') setMessage(INVALID_CREDENTIALS_MESSAGE)
    else if (result.reason === 'failed') setMessage(GENERIC_ERROR_MESSAGE)
  }

  return (
    <main className="login">
      <h1>Sign in</h1>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {message !== null && (
          <p role="alert" className="notice notice-error">
            {message}
          </p>
        )}
        <button type="submit" className="primary" disabled={pending}>
          Sign in
        </button>
      </form>
    </main>
  )
}
