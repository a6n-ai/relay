"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "./api-fetch";
import { AudienceBuilder, type AudienceValue, type ContactListOption } from "./audience-builder";

/**
 * Audience edit for a draft/scheduled campaign — the same AudienceBuilder the
 * composer uses, wrapped with its own edit/save toggle so the campaign detail
 * page can change who a still-unsent campaign will reach.
 */
export function CampaignAudienceEditor({
  campaignPublicId,
  audience,
  count,
  lists,
  requiresVerifiedPhone,
  timeZone,
}: {
  campaignPublicId: string;
  audience: AudienceValue;
  /** Recipient count already resolved server-side for the current (saved) audience. */
  count: number;
  lists: ContactListOption[];
  requiresVerifiedPhone: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<AudienceValue>(audience);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/notifications/campaigns/${campaignPublicId}/audience`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience: value }),
      });
      toast.success("Audience updated");
      setEditing(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="text-2xl font-semibold tabular-nums">{count}</span>{" "}
          <span className="text-muted-foreground">recipients</span>
        </p>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <PencilIcon className="size-3.5" /> Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AudienceBuilder
        lists={lists}
        value={value}
        onChange={setValue}
        requiresVerifiedPhone={requiresVerifiedPhone}
        timeZone={timeZone}
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => {
            setEditing(false);
            setValue(audience);
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
