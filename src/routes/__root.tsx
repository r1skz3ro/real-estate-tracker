import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '@/integrations/tanstack-query/devtools'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/features/projects/AppSidebar'
import { listProjectsFn } from '@/server/controllers/projects'

import appCss from '@/styles.css?url'

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
    // ponytail: SidebarProvider writes a `sidebar_state` cookie but never reads it, so the
    // collapsed state resets on reload. Read it in the root loader and pass `defaultOpen` if that
    // ever grates.
    <SidebarProvider>
      <AppSidebar projects={projects} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
          <SidebarTrigger />
        </header>
        <main className="min-w-0 flex-1 p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
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
