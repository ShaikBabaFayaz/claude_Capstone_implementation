import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'
import { TEST_CREDENTIALS } from './test/handlers.ts'
import { renderApp } from './test/render.tsx'

describe('App', () => {
  it('shows the login form when not signed in', () => {
    renderApp(<App />)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the application title bar on the sign-in screen and after sign-in', async () => {
    const { user } = renderApp(<App />)
    expect(screen.getByText('Task Management App')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), TEST_CREDENTIALS.username)
    await user.type(screen.getByLabelText('Password'), TEST_CREDENTIALS.password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByText('Task Management App')).toBeInTheDocument()
  })
})
