import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="mt-2 text-slate-600">
        Nothing here yet — project CRUD lands in phase 02.
      </p>
    </div>
  )
}
