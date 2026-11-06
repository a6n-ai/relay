"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Switch } from "@foundry/ui/switch";
import {
  EMAIL_EVENT_TYPES, FORCED_WEBHOOK, routingDiff, typeLabel,
  type EmailEventRouting, type EmailEventType, type EmailStream,
} from "./email-events-diff";

export interface EmailTypeRow { event: string; label: string; category: string; categoryLabel: string; tracked: boolean; locked: boolean }
export interface StreamState {
  stream: EmailStream;
  routing: EmailEventRouting;
  volume: Partial<Record<EmailEventType, number>>;
  /** Set when the stream's SES destinations could not be read; the rest of the page still renders. */
  error?: string;
}
type SaveResult = Promise<{ error?: string }>;
export interface EmailEventsSettingsProps {
  types?: EmailTypeRow[];
  streams: StreamState[];
  onSaveTypes?: (trackedEvents: string[]) => SaveResult;
  onSaveStream: (streamId: string, routing: { webhook: EmailEventType[]; counts?: EmailEventType[] }) => SaveResult;
}

const LOCKED_COPY = "Login and security emails stay untracked so they don't land in spam.";
const toggle = (list: EmailEventType[], t: EmailEventType) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

export function EmailEventsSettings({ types, streams, onSaveTypes, onSaveStream }: EmailEventsSettingsProps) {
  const hasTracked = streams.some((s) => s.stream.kind === "tracked");
  return (
    <div className="flex flex-col gap-6">
      {types && onSaveTypes && <TypesSection types={types} showTracked={hasTracked} onSave={onSaveTypes} />}
      {streams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SES streams configured</p>
      ) : (
        streams.map((s) => <StreamSection key={s.stream.id} state={s} onSave={onSaveStream} />)
      )}
    </div>
  );
}

function TypesSection({ types, showTracked, onSave }: { types: EmailTypeRow[]; showTracked: boolean; onSave: (e: string[]) => SaveResult }) {
  const [tracked, setTracked] = useState(() => new Set(types.filter((t) => t.tracked).map((t) => t.event)));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const groups = new Map<string, EmailTypeRow[]>();
  for (const t of types) groups.set(t.categoryLabel, [...(groups.get(t.categoryLabel) ?? []), t]);
  const save = () => start(async () => setError((await onSave([...tracked])).error));

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-medium">Email types</h3>
      {[...groups].map(([label, rows]) => (
        <div key={label} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {rows.map((r) => (
            <div key={r.event} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex flex-col">
                <span>{r.label}</span>
                {r.locked && <span className="text-xs text-muted-foreground">{LOCKED_COPY}</span>}
              </div>
              {showTracked && (
                <Switch
                  aria-label={`Track ${r.label}`}
                  checked={tracked.has(r.event)}
                  disabled={r.locked || pending}
                  onCheckedChange={(on) => setTracked((p) => { const n = new Set(p); if (on) n.add(r.event); else n.delete(r.event); return n; })}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div><Button size="sm" onClick={save} disabled={pending}>{error ? "Retry" : "Save types"}</Button></div>
    </section>
  );
}

function StreamSection({ state, onSave }: { state: StreamState; onSave: (id: string, r: { webhook: EmailEventType[]; counts?: EmailEventType[] }) => SaveResult }) {
  const { stream, volume } = state;
  const [saved, setSaved] = useState(state.routing);
  const [draft, setDraft] = useState(state.routing);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const rows = EMAIL_EVENT_TYPES.filter((t) => stream.kind !== "untracked" || (t !== "open" && t !== "click"));
  const changes = routingDiff(saved, draft);

  const save = () => start(async () => {
    const res = await onSave(stream.id, draft.counts ? { webhook: draft.webhook, counts: draft.counts } : { webhook: draft.webhook });
    setError(res.error);
    setConfirming(false);
    if (!res.error) setSaved(draft);
  });

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{stream.label}</h3>
        <Badge variant="secondary">{stream.kind}</Badge>
      </div>
      {state.error ? (
        <StreamReadError message={state.error} />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-medium">Event</th>
                <th className="py-1 font-medium">Last 30 days</th>
                <th className="py-1 font-medium">Webhook</th>
                <th className="py-1 font-medium">{draft.counts === null ? "Counts (Not set up)" : "Counts"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const forced = FORCED_WEBHOOK.includes(t);
                return (
                  <tr key={t} className="border-t">
                    <td className="py-1.5">{typeLabel(t)}</td>
                    <td className="py-1.5 text-muted-foreground">{volume[t]?.toLocaleString() ?? "—"}</td>
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${typeLabel(t)} webhook`}
                        checked={forced || draft.webhook.includes(t)}
                        disabled={forced || pending}
                        onChange={() => setDraft((d) => ({ ...d, webhook: toggle(d.webhook, t) }))}
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${typeLabel(t)} counts`}
                        checked={draft.counts?.includes(t) ?? false}
                        disabled={draft.counts === null || pending}
                        onChange={() => setDraft((d) => ({ ...d, counts: toggle(d.counts ?? [], t) }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || changes.length === 0} onClick={() => setConfirming(true)}>Save</Button>
            {error && <Button size="sm" variant="outline" disabled={pending} onClick={save}>Retry</Button>}
          </div>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save {stream.label} routing</DialogTitle>
                <DialogDescription>These changes apply to all mail sent through this stream.</DialogDescription>
              </DialogHeader>
              <ul className="flex flex-col gap-1 text-sm">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button disabled={pending} onClick={save}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}

function StreamReadError({ message }: { message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="text-sm text-destructive">{message}</p>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => router.refresh())}>
        {pending ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
