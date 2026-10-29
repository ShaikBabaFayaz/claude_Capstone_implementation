import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetDb } from './handlers.ts'
import { requestCounter, server } from './server.ts'

// Any request without a handler fails the test instead of silently reaching the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
  requestCounter.reset()
})

afterAll(() => server.close())
