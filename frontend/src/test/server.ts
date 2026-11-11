import { setupServer } from 'msw/node'
import { handlers } from './handlers.ts'

export const server = setupServer(...handlers)

// Request counter keyed by "METHOD /path" (query string ignored). Counts every request that
// reaches the server, handled or not.
const counts = new Map<string, number>()

server.events.on('request:start', ({ request }) => {
  const key = `${request.method} ${new URL(request.url).pathname}`
  counts.set(key, (counts.get(key) ?? 0) + 1)
})

export const requestCounter = {
  count(method: string, path: string): number {
    return counts.get(`${method.toUpperCase()} ${path}`) ?? 0
  },
  total(): number {
    let sum = 0
    for (const n of counts.values()) sum += n
    return sum
  },
  reset(): void {
    counts.clear()
  },
}
