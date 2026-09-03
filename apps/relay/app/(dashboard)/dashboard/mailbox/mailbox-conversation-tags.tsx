"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { apiFetch } from "@relay/engine/ui";
import type { AppMessageTag } from "@/lib/mailbox/listing";

export function MailboxConversationTags({
  tenantPublicId,
  tags,
}: {
  tenantPublicId: string;
  tags: AppMessageTag[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/api/notifications/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, label: label.trim() }),
      });
      setLabel("");
      router.refresh();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string) {
    setBusy(true);
    try {
      await apiFetch("/api/notifications/tags", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, slug }),
      });
      router.refresh();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        Tags apply to every message for this app. Manage the full list under Tags.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <Badge key={t.slug} variant="outline" className="rounded-none gap-1 pr-1">
            {t.label}
            <button
              type="button"
              className="grid size-4 place-items-center hover:bg-muted"
              aria-label={`Remove ${t.label}`}
              disabled={busy}
              onClick={() => void remove(t.slug)}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        {tags.length === 0 ? (
          <span className="text-muted-foreground text-sm">No tags yet</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label="New tag"
          placeholder="Tag this app"
          value={label}
          disabled={busy}
          className="max-w-56"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => void add()}>
          Tag
        </Button>
      </div>
    </div>
  );
}
