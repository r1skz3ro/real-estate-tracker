import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fmtArea, fmtPerM2, fmtPrice, fmtWhen } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LinkListing } from './types'

const DASH = '—'

export function ListingsTable({ listings }: { listings: Array<LinkListing> }) {
  return (
    // Six columns do not fit a phone; the table scrolls inside its own box rather than the page.
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Listing</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Area</TableHead>
            <TableHead className="text-right">zł/m²</TableHead>
            <TableHead>Posted</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => (
            <TableRow
              key={listing.id}
              className={cn(listing.removedAt && 'opacity-60')}
            >
              <TableCell className="max-w-80">
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noreferrer"
                  title={listing.title}
                  className="flex items-center gap-1.5 truncate hover:underline"
                >
                  <span
                    className={cn(
                      'truncate',
                      listing.removedAt && 'line-through',
                    )}
                  >
                    {listing.title}
                  </span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
                <span className="text-xs text-muted-foreground">
                  {listing.location ?? DASH}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtPrice(listing.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {fmtArea(listing.areaM2)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {fmtPerM2(listing.pricePerM2)}
              </TableCell>
              {/* Only three of the five portals publish one — a dash here means the portal said
                  nothing, not that the listing is undated. */}
              <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {listing.postedAt ? fmtWhen(listing.postedAt) : DASH}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {fmtWhen(listing.firstSeenAt)}
                {listing.removedAt && (
                  <Badge variant="outline" className="ml-2 text-amber-400">
                    gone
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
