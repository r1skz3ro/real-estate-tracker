import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { listProjectsFn } from '../server/projects'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Estate Tracker',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  // The sidebar needs the project list on every route, so it is loaded once here and reused by
  // the index route via useLoaderData({ from: '__root__' }).
  loader: () => listProjectsFn(),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootLayout() {
  const projects = Route.useLoaderData()

  return (
    <div className="flex min-h-screen text-slate-900">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 p-4">
        <Link to="/" className="block text-lg font-semibold">
          Estate Tracker
        </Link>
        {projects.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No projects yet</p>
        ) : (
          <nav className="mt-6 space-y-1">
            {projects.map((project) => (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: String(project.id) }}
                activeProps={{ className: 'bg-slate-200 font-medium' }}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100"
              >
                <span className="truncate">{project.name}</span>
                {project.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                    {project.unread}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
