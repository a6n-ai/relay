"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { cn } from "@foundry/ui/cn";
import { FLOW_STEPS, type FlowStep } from "./steps";

/** Header + step indicator + fixed bottom bar shared by the three campaign steps. */
export function FlowShell({
  campaignPublicId,
  name,
  status,
  step,
  backHref,
  saveStatus,
  onRename,
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
  onRename: (name: string) => Promise<void>;
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
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={backHref}
          onClick={(e) => {
            if (!onBack) return;
            e.preventDefault();
            void onBack().then(() => router.push(backHref));
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> All campaigns
        </Link>
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
          className="hover:bg-muted/50 focus-visible:ring-ring min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-xl font-semibold outline-none focus-visible:ring-2"
        />
        <Badge variant="outline" className="capitalize">
          {status}
        </Badge>
        {saveStatus}
      </div>

      <ol className="flex items-center gap-2 text-sm" aria-label="Campaign steps">
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
              {i < FLOW_STEPS.length - 1 && <span className="bg-border h-px w-6" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {children}

      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-end gap-2 px-6 py-3">{bottom}</div>
      </div>
    </div>
  );
}
