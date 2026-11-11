import LoginPage from './auth/LoginPage.tsx'
import { useAuth } from './auth/useAuth.ts'
import TasksPage from './tasks/TasksPage.tsx'

export default function App() {
  const { isAuthenticated } = useAuth()
  return (
    <>
      <header className="app-bar">
        <p className="app-title">Task Management App</p>
      </header>
      {isAuthenticated ? <TasksPage /> : <LoginPage />}
    </>
  )
}
