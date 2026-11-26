import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EventTimeline, type TimelineItem } from "../../components/event-timeline";
import { formatWhen } from "../../lib/format-date";
import { LetterView } from "../../components/letter-view";
import { Toolbar } from "../../components/page/toolbar";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/status-badge";
import { fetchApps } from "../../console/apps.fns";
import { previewHint } from "../../components/preview-hint";
import { fetchMessage } from "../../console/messages.fns";
import { Hint, SectionTitle } from "../../components/page/text";

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
        <PageHeader crumbs={[{ label: "Messages" }, { label: "Message" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in result) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Messages" }, { label: "Message" }]} />
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

  const hasHtml = m.htmlSafe !== null;
  const hasRaw = m.direction === "in" && m.hasRaw;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Messages" },
          { label: m.direction === "in" ? "Received" : "Sent", to: "/messages", search: { dir: m.direction } },
          { label: m.subject || "(no subject)" },
        ]}
      />
      {hasHtml || hasRaw ? (
        <Toolbar>
          {hasHtml ? (
            <Button variant="outline" render={<a href={`/api/console/messages/${m.id}/html`} />}>
              Download HTML
            </Button>
          ) : null}
          {hasRaw ? (
            <Button variant="outline" render={<a href={`/api/console/messages/${m.id}/raw`} />}>
              Download original
            </Button>
          ) : null}
        </Toolbar>
      ) : null}
      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <aside aria-label="Details" className="grid gap-6 lg:col-start-2 lg:row-start-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">From</dt>
            <dd className="break-all">{m.fromEmail ?? "—"}</dd>
            <dt className="text-muted-foreground">To</dt>
            <dd className="break-all">{m.toEmail ?? "—"}</dd>
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
        </aside>

        <div className="grid min-w-0 gap-6 lg:col-start-1 lg:row-start-1">
          {m.htmlSafe === null && !m.text ? (
            <Hint>The body of imported mail was not kept.</Hint>
          ) : (
            <LetterView
              htmlSafe={m.htmlSafe}
              text={m.text}
              blockedRemote={m.blockedRemote}
              images={images === true}
              onShowImages={() => navigate({ search: { images: true } })}
            />
          )}

          {m.attachments.length > 0 ? (
            <section aria-label="Attachments" className="grid gap-2">
              <SectionTitle>Attachments</SectionTitle>
              <ul className="grid gap-1 text-sm">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/console/messages/${m.id}/${a.id}`} className="hover:underline">
                      {a.filename}
                    </a>{" "}
                    <Hint as="span" size="xs">{kb(a.sizeBytes)}</Hint>
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

          {m.thread.length > 0 ? (
            <section aria-label="Thread" className="grid gap-2">
              <SectionTitle>In this thread</SectionTitle>
              <ul className="grid gap-1 text-sm">
                {m.thread.map((t) => (
                  <li key={t.id}>
                    <Link to="/messages/$messageId" params={{ messageId: t.id }} className="hover:underline">
                      {t.subject || "(no subject)"}
                    </Link>{" "}
                    <Hint as="span" size="xs">{formatWhen(t.createdAt)}</Hint>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
