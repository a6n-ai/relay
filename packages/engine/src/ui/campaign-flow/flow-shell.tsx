"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { cn } from "@foundry/ui/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { FLOW_STEPS, type FlowStep } from "./steps";

const DEFAULT_SENDER = "__default";

/** Header + step indicator + fixed bottom bar shared by the three campaign steps. */
export function FlowShell({
  campaignPublicId,
  name,
  status,
  step,
  backHref,
  saveStatus,
  actions,
  onRename,
  senders,
  brand,
  onBrand,
  onBack,
  bottom,
  reachable,
  children,
}: {
  campaignPublicId: string;
  name: string;
  status: string;
  step: FlowStep;
  backHref: string;
  saveStatus?: ReactNode;
  /** Buttons on the right of the title row. */
  actions?: ReactNode;
  onRename: (name: string) => Promise<void>;
  /** Sender picker; hidden when absent, empty, `brand` is undefined (tables without a brand column) or the campaign is sent. */
  senders?: { value: string; label: string }[];
  brand?: string | null;
  onBrand?: (brand: string | null) => Promise<void>;
  /** Runs before leaving for the list, e.g. to flush a pending save. */
  onBack?: () => Promise<void>;
  bottom: ReactNode;
  /** A step is a link only once the steps before it are complete. */
  reachable: Record<FlowStep, boolean>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [draftName, setDraftName] = useState(name);
  const current = FLOW_STEPS.findIndex((s) => s.key === step);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link
          href={backHref}
          onClick={(e) => {
            if (!onBack) return;
            e.preventDefault();
            void onBack().then(() => router.push(backHref));
          }}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> All campaigns
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-72 flex-wrap items-center gap-3">
            <input
              aria-label="Campaign name (internal)"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={() => {
                const next = draftName.trim();
                if (!next) setDraftName(name);
                else if (next !== name) void onRename(next);
              }}
              className="hover:bg-muted/50 focus-visible:ring-ring -ml-2 field-sizing-content max-w-full min-w-0 rounded-md bg-transparent px-2 py-1 text-xl font-semibold outline-none focus-visible:ring-2"
            />
            <Badge variant="outline" className="capitalize">
              {status}
            </Badge>
            {senders?.length && brand !== undefined && (status === "draft" || status === "scheduled") ? (
              <Select value={brand ?? DEFAULT_SENDER} onValueChange={(v) => void onBrand?.(v === DEFAULT_SENDER ? null : v)}>
                <SelectTrigger aria-label="Sender" className="w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_SENDER}>Default sender</SelectItem>
                  {senders.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {saveStatus}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Campaign steps">
        {FLOW_STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const body = (
            <span
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5",
                active ? "border-primary text-foreground font-medium" : "text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                  done || active ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {done ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              {s.label}
            </span>
          );
          return (
            <li key={s.key} className="flex items-center gap-2">
              {reachable[s.key] && !active ? (
                <Link href={`/dashboard/notifications/campaigns/${campaignPublicId}?step=${s.key}`}>{body}</Link>
              ) : (
                body
              )}
              {i < FLOW_STEPS.length - 1 && <span className="bg-border hidden h-px w-6 sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {children}

      {/* Sticky, not fixed: it stays inside the content column instead of sliding under the app sidebar. */}
      <div className="bg-background/95 sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t py-3 backdrop-blur">
        {bottom}
      </div>
    </div>
  );
}
