import { Card } from "@foundry/ui/card";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { type RowAction, RowMenu } from "./row-menu";
import { Hint } from "../form/text";
import { focusRingSoft } from "../lib/focus";
import { cn } from "@foundry/ui/cn";

// Same rule as ResourceTable rows: only real controls sit above the overlay link.
const CARD_LINK =
  "relative hover:bg-muted/50 [&_:is(a,button,input,select,textarea,label,[role=switch],[role=checkbox],[role=combobox],[role=menuitem]):not([data-row-link])]:relative [&_:is(a,button,input,select,textarea,label,[role=switch],[role=checkbox],[role=combobox],[role=menuitem]):not([data-row-link])]:z-10";

export function ResourceGrid<T>({
  items,
  rowKey,
  card,
  href,
  rowLabel,
  menu,
  empty,
}: {
  items: T[];
  rowKey: (row: T) => string;
  card: (row: T) => ReactNode;
  href?: (row: T) => LinkProps;
  rowLabel?: (row: T) => string;
  menu?: (row: T) => RowAction[];
  empty: ReactNode;
}) {
  if (items.length === 0) return <div className="p-4">{typeof empty === "string" ? <Hint>{empty}</Hint> : empty}</div>;
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((row) => {
        const to = href?.(row);
        return (
          <Card key={rowKey(row)} className={to ? CARD_LINK : "relative"}>
            <div className="px-(--card-spacing)">{card(row)}</div>
            {to ? (
              <Link
                {...to}
                data-row-link
                aria-label={rowLabel?.(row) ?? "Open"}
                className={cn("absolute inset-0", focusRingSoft)}
              />
            ) : null}
            {menu ? (
              <div className="absolute right-2 top-2 z-10">
                <RowMenu actions={menu(row)} label="Row actions" />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

// The body every ResourceGrid card shares: a title, an optional badge row, hint lines, and any extra control below.
export function ResourceCard({ title, badge, hints = [], children }: { title: ReactNode; badge?: ReactNode; hints?: ReactNode[]; children?: ReactNode }) {
  return (
    <div className="grid gap-1.5 pr-8">
      <span className="font-medium">{title}</span>
      {badge ? <div>{badge}</div> : null}
      {hints.map((hint, i) => (hint ? <Hint key={i} size="xs">{hint}</Hint> : null))}
      {children}
    </div>
  );
}
