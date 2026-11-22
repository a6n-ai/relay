"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { addMailboxGrantAction, removeMailboxGrantAction } from "@/app/(dashboard)/dashboard/settings/mailboxes/[id]/actions";
import type { AccessGrid } from "@/lib/mailbox/access-grid";
import {
  applyServerGrants,
  beginToggle,
  grantKey,
  grantTarget,
  isLocked,
  settleToggle,
  type AccessState,
  type GridColumn,
} from "./mailbox-access-state";

export function MailboxAccessGrid({ grid }: { grid: AccessGrid }) {
  const router = useRouter();
  const [state, setState] = useState<AccessState>({ grants: grid.grants, pending: [] });
  const stateRef = useRef(state);

  function commit(next: AccessState) {
    stateRef.current = next;
    setState(next);
  }

  // Server data replaces the optimistic copy after each router.refresh; in-flight cells keep their optimistic value.
  useEffect(() => {
    commit(applyServerGrants(stateRef.current, grid.grants));
  }, [grid]);

  function toggle(mailboxPublicId: string, column: GridColumn, on: boolean) {
    const target = grantTarget(column);
    const key = grantKey(mailboxPublicId, target);
    const previous = stateRef.current.grants[key];
    const next = beginToggle(stateRef.current, key, on);
    if (!next) return;
    commit(next);

    const request = on
      ? addMailboxGrantAction(mailboxPublicId, target)
      : removeMailboxGrantAction(previous ?? "");
    const fail = () => {
      commit(settleToggle(stateRef.current, key, previous, false));
      toast.error("Access could not be changed. Try again.");
      router.refresh();
    };
    request.then((result) => {
      if (result.error) return fail();
      commit(settleToggle(stateRef.current, key, previous, true));
      router.refresh();
    }, fail);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 left-0 z-20 bg-card after:pointer-events-none after:absolute after:inset-y-0 after:-right-3 after:w-3 after:bg-linear-to-r after:from-card after:to-transparent after:content-['']">
            Mailbox
          </TableHead>
          {grid.columns.map((c) => (
            <TableHead key={grantKey("", grantTarget(c))} className="sticky top-0 z-10 bg-card text-center">
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {grid.mailboxes.map((m) => (
          <TableRow key={m.publicId}>
            <TableCell className="sticky left-0 z-10 bg-card after:pointer-events-none after:absolute after:inset-y-0 after:-right-3 after:w-3 after:bg-linear-to-r after:from-card after:to-transparent after:content-['']">
              <div>{m.email}</div>
              <div className="text-xs text-muted-foreground">{m.appName}</div>
            </TableCell>
            {grid.columns.map((c) => {
              const key = grantKey(m.publicId, grantTarget(c));
              return (
                <TableCell key={key} className="text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={`${c.label} can see ${m.email}`}
                    checked={state.grants[key] !== undefined}
                    disabled={isLocked(state, key)}
                    onChange={(e) => toggle(m.publicId, c, e.target.checked)}
                  />
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
