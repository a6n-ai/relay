"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AudienceBreakdown } from "../../audience";
import { apiFetch } from "../api-fetch";
import { AudienceBuilder, type AudienceValue, type ContactListOption } from "../audience-builder";

const EXCLUDED: { key: keyof AudienceBreakdown["excluded"]; label: string; filter?: string }[] = [
  { key: "unsubscribed", label: "Unsubscribed", filter: "reason=unsubscribe" },
  { key: "suppressed", label: "Bounced, complained or blocked", filter: "scope=all" },
  { key: "noConsent", label: "Consent lapsed" },
  { key: "invalid", label: "Invalid address" },
  { key: "duplicates", label: "Duplicates" },
];

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface AudienceStepHandle {
  /** Run any pending save now and wait for it, so leaving the step never drops an edit. */
  settle: () => Promise<void>;
}

/** Step 2: pick lists and rules; the server says who is eligible and who is left out, and why. */
export const AudienceStep = forwardRef<
  AudienceStepHandle,
  {
    campaignPublicId: string;
    initial: AudienceValue;
    lists: ContactListOption[];
    timeZone: string;
    requiresVerifiedPhone: boolean;
    unsubscribedHref: string;
    /** null while an edit is still being saved and counted. */
    onEligible: (eligible: number | null) => void;
  }
>(function AudienceStep(
  { campaignPublicId, initial, lists, timeZone, requiresVerifiedPhone, unsubscribedHref, onEligible },
  ref,
) {
  const [value, setValue] = useState<AudienceValue>(initial);
  const [breakdown, setBreakdown] = useState<AudienceBreakdown | null>(null);
  const seq = useRef(0);
  const first = useRef(initial);
  const lastEligible = useRef<number | null>(null);
  // One save at a time, in edit order: a slow earlier save can never land on top of a later one.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<(() => void) | null>(null);
  const router = useRouter();

  // Save, then count, debounced: the count on screen is always for the saved audience.
  useEffect(() => {
    onEligible(null);
    const mine = ++seq.current;
    const edited = value !== first.current;
    const run = () => {
      pending.current = null;
      chain.current = chain.current.then(async () => {
        try {
          if (edited) {
            await apiFetch(`/api/notifications/campaigns/${campaignPublicId}/audience`, post({ audience: value }));
            // Keep the cached page current for browser Back/Forward.
            router.refresh();
          }
          const res = await apiFetch<{ count: number; breakdown: AudienceBreakdown }>(
            "/api/notifications/campaigns/audience-count",
            post(value),
          );
          if (mine !== seq.current) return;
          setBreakdown(res.breakdown);
          lastEligible.current = res.breakdown.eligible;
          onEligible(res.breakdown.eligible);
        } catch {
          // apiFetch already toasted the failure. Unlock Back; Continue stays blocked unless a count is known.
          if (mine === seq.current) onEligible(lastEligible.current ?? 0);
        }
      });
    };
    const id = setTimeout(run, edited ? 400 : 0);
    pending.current = () => {
      clearTimeout(id);
      run();
    };
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on audience edits only
  }, [value, campaignPublicId]);

  useImperativeHandle(ref, () => ({
    settle: async () => {
      pending.current?.();
      await chain.current;
    },
  }));

  const excludedTotal = breakdown ? Object.values(breakdown.excluded).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="rounded-xl border p-5">
        <AudienceBuilder
          value={value}
          onChange={setValue}
          lists={lists}
          timeZone={timeZone}
          requiresVerifiedPhone={requiresVerifiedPhone}
          hideCount
        />
      </div>
      <aside className="space-y-4 rounded-xl border p-5 lg:sticky lg:top-4" aria-live="polite">
        <div>
          <p className="text-muted-foreground text-sm">Eligible recipients</p>
          <p className="text-4xl font-semibold tabular-nums">{breakdown ? breakdown.eligible.toLocaleString() : "…"}</p>
        </div>
        {breakdown && excludedTotal > 0 && (
          <div className="space-y-1.5 border-t pt-4 text-sm">
            <p className="font-medium">Up to {excludedTotal.toLocaleString()} left out</p>
            {EXCLUDED.filter((e) => breakdown.excluded[e.key] > 0).map((e) => (
              <p key={e.key} className="text-muted-foreground flex justify-between gap-3">
                {e.filter ? (
                  <Link href={`${unsubscribedHref}?${e.filter}`} className="underline underline-offset-2">
                    {e.label}
                  </Link>
                ) : (
                  <span>{e.label}</span>
                )}
                <span className="tabular-nums">{breakdown.excluded[e.key].toLocaleString()}</span>
              </p>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Eligible is exact. The left-out figures count list rows, so someone on two lists, or left out for two
          reasons, appears twice. Counted on the server with the same rules the send uses. Consent, unsubscribes and suppressions always win over
          these filters.
        </p>
      </aside>
    </div>
  );
});
