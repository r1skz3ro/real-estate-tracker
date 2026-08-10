import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LinkActivity } from './LinkActivity'
import { LinkHeader } from './LinkHeader'
import { LinkListings } from './LinkListings'
import { LinkSettings } from './LinkSettings'
import { ListingsTable } from './ListingsTable'
import { isInitialFetch } from './runHistory'
import { useLatestListings } from './useLinkListings'
import { useLinkRun } from './useLinkRun'
import type { Link, LinkStats } from './types'
import type { ListingFilter } from './useLinkListings'

const PREVIEW = 10

export function LinkPage({
  link,
  stats,
  projectName,
}: {
  link: Link
  stats: LinkStats | undefined
  projectName: string
}) {
  const run = useLinkRun(link)
  const [filter, setFilter] = useState<ListingFilter>('all')

  return (
    <div className="max-w-5xl space-y-6">
      <LinkHeader
        link={link}
        stats={stats}
        projectName={projectName}
        run={run}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <Overview link={link} stats={stats} />
        </TabsContent>

        <TabsContent value="listings" className="mt-4">
          <Card>
            <CardContent>
              <LinkListings
                linkId={link.id}
                filter={filter}
                onFilter={setFilter}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Fetch history</CardTitle>
            </CardHeader>
            <CardContent>
              <LinkActivity run={run} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <LinkSettings link={link} stats={stats} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Overview({
  link,
  stats,
}: {
  link: Link
  stats: LinkStats | undefined
}) {
  const initial = isInitialFetch(link, stats)
  const latest = useLatestListings(link.id, PREVIEW)
  const listings = latest.data?.listings ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? 'Initial fetch' : 'Latest listings'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* A baseline deliberately reports nothing — without this the first fetch looks like it
            failed, which is the whole reason the newest few are shown here. */}
        {initial && (
          <Alert>
            <AlertTitle>This link has only had its first fetch</AlertTitle>
            <AlertDescription>
              Showing the {Math.min(PREVIEW, stats?.tracked ?? 0)} newest of{' '}
              {stats?.tracked ?? 0} listings recorded as the starting point. A
              first fetch reports no changes on purpose — a fresh search finds
              months of old listings, and calling them news would bury the real
              news. Changes start with the next refresh.
            </AlertDescription>
          </Alert>
        )}

        {link.baselinedAt === null && !latest.isLoading && (
          <p className="text-sm text-muted-foreground">
            Not fetched yet — refresh to record a baseline.
          </p>
        )}
        {latest.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {latest.error && (
          <p className="text-sm text-destructive">{latest.error.message}</p>
        )}
        {listings.length > 0 && <ListingsTable listings={listings} />}
      </CardContent>
    </Card>
  )
}
