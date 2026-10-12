"use client";

import { useEffect, useRef, useState } from "react";
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

/** Step 2: pick lists and rules; the server says who is eligible and who is left out, and why. */
export function AudienceStep({
  campaignPublicId,
  initial,
  lists,
  timeZone,
  requiresVerifiedPhone,
  unsubscribedHref,
  onEligible,
}: {
  campaignPublicId: string;
  initial: AudienceValue;
  lists: ContactListOption[];
  timeZone: string;
  requiresVerifiedPhone: boolean;
  unsubscribedHref: string;
  /** null while an edit is still being saved and counted. */
  onEligible: (eligible: number | null) => void;
}) {
  const [value, setValue] = useState<AudienceValue>(initial);
  const [breakdown, setBreakdown] = useState<AudienceBreakdown | null>(null);
  const seq = useRef(0);
  const router = useRouter();

  // Save, then count, debounced: the count on screen is always for the saved audience.
  useEffect(() => {
    onEligible(null);
    const mine = ++seq.current;
    const edited = mine > 1;
    const id = setTimeout(
      async () => {
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
          onEligible(res.breakdown.eligible);
        } catch {
          // apiFetch already toasted the failure detail.
        }
      },
      edited ? 400 : 0,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on audience edits only
  }, [value, campaignPublicId]);

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
        />
      </div>
      <aside className="space-y-4 rounded-xl border p-5 lg:sticky lg:top-4" aria-live="polite">
        <div>
          <p className="text-muted-foreground text-sm">Eligible recipients</p>
          <p className="text-4xl font-semibold tabular-nums">{breakdown ? breakdown.eligible.toLocaleString() : "…"}</p>
        </div>
        {breakdown && excludedTotal > 0 && (
          <div className="space-y-1.5 border-t pt-4 text-sm">
            <p className="font-medium">{excludedTotal.toLocaleString()} left out</p>
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
          Counted on the server with the same rules the send uses. Consent, unsubscribes and suppressions always win over
          these filters.
        </p>
      </aside>
    </div>
  );
}
