import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EventTimeline, formatWhen, type TimelineItem } from "../../components/event-timeline";
import { LetterView } from "../../components/letter-view";
import { ViewHeader } from "../../components/view-header";
import { StatusBadge } from "../../components/status-badge";
import { fetchApps } from "../../console/apps.fns";
import { previewHint } from "../../components/preview-hint";
import { fetchMessage } from "../../console/messages.fns";

export const Route = createFileRoute("/_app/messages_/$messageId")({
  validateSearch: (search: Record<string, unknown>): { images?: boolean } => ({
    images: search.images === true || search.images === "true" ? true : undefined,
  }),
  loaderDeps: ({ search }) => ({ images: search.images }),
  loader: ({ params, deps }) =>
    Promise.all([fetchMessage({ data: { id: params.messageId, images: deps.images } }), fetchApps()]),
  component: MessagePage,
});

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function MessagePage() {
  const [result, apps] = Route.useLoaderData();
  const { images } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/messages/$messageId" });
  if (!result) {
    return (
      <>
        <ViewHeader title="Message" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in result) {
    return (
      <>
        <ViewHeader title="Message" />
        <DeniedState reason="not-found" label="Message not found" />
      </>
    );
  }
  const m = result.message;
  const appName = apps?.find((a) => a.id === m.appId)?.name ?? "App";
  const timeline: TimelineItem[] = [
    ...(m.direction === "in"
      ? [{ label: "Received", at: m.createdAt }]
      : [{ label: "Queued", at: m.createdAt }, ...(m.sentAt === null ? [] : [{ label: "Sent", at: m.sentAt }])]),
    ...m.events.map((e) => ({ label: e.type, at: e.occurredAt, detail: e.detail })),
    ...(m.status === "failed" ? [{ label: "Failed", at: m.updatedAt, detail: m.error }] : []),
  ];

  return (
    <>
      <ViewHeader title={m.subject || "(no subject)"} />
      <div className="grid gap-6 p-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd className="break-all">{m.fromEmail ?? "-"}</dd>
          <dt className="text-muted-foreground">To</dt>
          <dd className="break-all">{m.toEmail ?? "-"}</dd>
          <dt className="text-muted-foreground">App</dt>
          <dd>{appName}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge status={m.status} direction={m.direction} />
          </dd>
        </dl>

        <section aria-label="Timeline">
          <EventTimeline items={timeline} />
        </section>

        <LetterView
          htmlSafe={m.htmlSafe}
          text={m.text}
          blockedRemote={m.blockedRemote}
          images={images === true}
          onShowImages={() => navigate({ search: { images: true } })}
        />

        {m.attachments.length > 0 ? (
          <section aria-label="Attachments" className="grid gap-2">
            <h2 className="text-sm font-medium">Attachments</h2>
            <ul className="grid gap-1 text-sm">
              {m.attachments.map((a) => (
                <li key={a.id}>
                  <a href={`/api/console/messages/${m.id}/${a.id}`} className="hover:underline">
                    {a.filename}
                  </a>{" "}
                  <span className="text-xs text-muted-foreground">{kb(a.sizeBytes)}</span>
                  {previewHint(a.contentType, a.filename) ? (
                    <>
                      {" "}
                      <a
                        href={`/api/console/messages/${m.id}/${a.id}?view=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        Open
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav aria-label="Downloads" className="flex flex-wrap gap-4 text-sm">
          {m.htmlSafe === null ? null : (
            <a href={`/api/console/messages/${m.id}/html`} className="hover:underline">
              Download HTML
            </a>
          )}
          {m.direction === "in" && m.hasRaw ? (
            <a href={`/api/console/messages/${m.id}/raw`} className="hover:underline">
              Download original
            </a>
          ) : null}
        </nav>

        {m.thread.length > 0 ? (
          <section aria-label="Thread" className="grid gap-2">
            <h2 className="text-sm font-medium">In this thread</h2>
            <ul className="grid gap-1 text-sm">
              {m.thread.map((t) => (
                <li key={t.id}>
                  <Link to="/messages/$messageId" params={{ messageId: t.id }} className="hover:underline">
                    {t.subject || "(no subject)"}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">{formatWhen(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
