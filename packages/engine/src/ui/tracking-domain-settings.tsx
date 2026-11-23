"use client";

import { useState, useTransition } from "react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import type { EmailStream } from "./email-events-diff";

export interface TrackingStreamState {
  stream: EmailStream;
  domain: string | null;
  /** Set when the stream's tracking domain could not be read; the other streams still render. */
  error?: string;
}
export interface TrackingDomainSettingsProps {
  streams: TrackingStreamState[];
  region: string;
  onSave: (streamId: string, domain: string | null) => Promise<{ error?: string }>;
}

export function TrackingDomainSettings({ streams, region, onSave }: TrackingDomainSettingsProps) {
  return (
    <div className="flex flex-col gap-4">
      {streams.map((s) => (
        <TrackingStreamRow key={s.stream.id} state={s} region={region} onSave={onSave} />
      ))}
    </div>
  );
}

function TrackingStreamRow({ state, region, onSave }: { state: TrackingStreamState; region: string; onSave: TrackingDomainSettingsProps["onSave"] }) {
  const [saved, setSaved] = useState(state.domain);
  const [draft, setDraft] = useState(state.domain ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const save = (domain: string | null) => start(async () => {
    const res = await onSave(state.stream.id, domain);
    setError(res.error);
    if (!res.error) {
      setSaved(domain);
      setDraft(domain ?? "");
    }
  });

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{state.stream.label}</h3>
        <Badge variant="secondary">{state.stream.kind}</Badge>
        <span className="text-sm text-muted-foreground">{saved ?? "Shared default"}</span>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`${state.stream.label} tracking domain`}
              placeholder="track.example.com"
              value={draft}
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              className="max-w-xs"
            />
            <Button size="sm" disabled={pending || draft.trim() === "" || draft.trim() === saved} onClick={() => save(draft.trim())}>
              Save
            </Button>
            <Button size="sm" variant="outline" disabled={pending || saved === null} onClick={() => save(null)}>
              Clear
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Add a proxied CNAME from {draft.trim() || "<domain>"} to r.{region}.awstrack.me (SSL: Full)</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </section>
  );
}
