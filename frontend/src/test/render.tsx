import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from '../auth/AuthProvider.tsx'
import { API_BASE } from './handlers.ts'

// Render helper shared by UI tests: wraps the element in AuthProvider pointed at the MSW base URL.
export function renderApp(ui: ReactElement) {
  const user = userEvent.setup()
  return { user, ...render(<AuthProvider baseUrl={API_BASE}>{ui}</AuthProvider>) }
}
