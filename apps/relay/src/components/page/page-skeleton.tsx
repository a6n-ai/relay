import { Card, CardContent, CardFooter, CardHeader } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { Fragment } from "react";
import { type Crumb, PageHeader } from "../shell/page-header";
import { FormPanel } from "./form-parts";
import { TableInset } from "./table-inset";
import { Toolbar } from "./toolbar";

// Each skeleton renders the page's own header and mirrors its layout, so nothing moves when data arrives.
type Props = { crumbs?: Crumb[] };

const WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-1/2", "w-2/3"];

function Frame({ columns, rows }: { columns: number; rows: number }) {
  return (
    <TableInset>
      <Table role="status" aria-label="Loading">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            {Array.from({ length: columns }, (_, c) => (
              <TableHead key={c}>
                <Skeleton className={`h-4 ${c === 0 ? "w-20" : "w-16"}`} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, r) => (
            <TableRow key={r}>
              <TableCell className="w-10">
                <Skeleton className="h-4 w-4" />
              </TableCell>
              {Array.from({ length: columns }, (_, c) => (
                <TableCell key={c}>
                  <Skeleton className={`h-4 ${WIDTHS[c % WIDTHS.length]}`} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableInset>
  );
}

function SkeletonToolbar({ search, filter, view, action }: { search?: boolean; filter?: boolean; view?: boolean; action?: boolean }) {
  if (!search && !filter && !view && !action) return null;
  return (
    <Toolbar
      search={search ? <Skeleton className="h-8 w-full" /> : undefined}
      filters={filter ? <Skeleton className="h-8 w-20" /> : undefined}
      view={view ? <Skeleton className="h-8 w-16" /> : undefined}
    >
      {action ? <Skeleton className="h-8 w-28" /> : undefined}
    </Toolbar>
  );
}

function CardSkeleton({ body = 1 }: { body?: number }) {
  return (
    <Card role="status" aria-label="Loading">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-2">
        {Array.from({ length: body }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </CardContent>
      <CardFooter className="justify-end">
        <Skeleton className="h-8 w-24" />
      </CardFooter>
    </Card>
  );
}

// Toolbar plus one framed table per section; `sections` are the real section titles.
export function ListSkeleton({
  crumbs,
  columns,
  rows = 8,
  sections,
  card,
  ...toolbar
}: Props & { columns: number; rows?: number; sections?: string[]; card?: boolean; search?: boolean; filter?: boolean; view?: boolean; action?: boolean }) {
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <SkeletonToolbar {...toolbar} />
      {card ? (
        <div className="px-4 pb-4">
          <CardSkeleton />
        </div>
      ) : null}
      {(sections ?? [null]).map((title, i) => (
        <Fragment key={title ?? i}>
          {title ? <h2 className={`px-4 pb-2 text-sm font-medium ${i > 0 ? "pt-6" : ""}`}>{title}</h2> : null}
          <Frame columns={columns} rows={title ? Math.min(rows, 3) : rows} />
        </Fragment>
      ))}
    </>
  );
}

function StatTileSkeleton() {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>
  );
}

// Stat tiles, plus the usage meter and daily bars when the page has them (Overview).
export function CardsSkeleton({ crumbs, tiles = 4, usage = true, days = 7 }: Props & { tiles?: number; usage?: boolean; days?: number }) {
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <div className="grid gap-4 p-4" role="status" aria-label="Loading">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: tiles }, (_, i) => (
            <StatTileSkeleton key={i} />
          ))}
        </div>
        {usage ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Skeleton shape="pill" className="h-2 flex-1" />
              <Skeleton className="h-5 w-24" />
            </CardContent>
          </Card>
        ) : null}
        {days > 0 ? (
          <Card>
            <CardContent className="grid gap-2">
              {Array.from({ length: days }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton shape="pill" className="h-2 flex-1" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

// Stacked settings cards in the one form wrapper; `action` is the page primary beside the title.
export function FormSkeleton({ crumbs, cards = 1, action }: Props & { cards?: number; action?: boolean }) {
  return (
    <>
      <PageHeader crumbs={crumbs} actions={action ? <Skeleton className="h-9 w-24" /> : undefined} />
      <FormPanel>
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </FormPanel>
    </>
  );
}

// Body block beside a key/value column and a short timeline.
export function DetailSkeleton({ crumbs, action }: Props & { action?: boolean }) {
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <SkeletonToolbar action={action} />
      <div role="status" aria-label="Loading" className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside className="grid gap-6 lg:col-start-2 lg:row-start-1">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Fragment key={i}>
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-5 w-2/3" />
              </Fragment>
            ))}
          </div>
          <div className="grid gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-3/4" />
            ))}
          </div>
        </aside>
        <div className="grid min-w-0 gap-3 lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </>
  );
}
