import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageDenied } from "../../components/page/page-denied";
import { EventTimeline, type TimelineItem } from "../../components/messages/event-timeline";
import { formatWhen } from "../../components/lib/format-date";
import { LetterView } from "../../components/letter-view";
import { Toolbar } from "../../components/page/toolbar";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/page/status-badge";
import { previewHint } from "../../components/messages/preview-hint";
import { fetchMessage } from "../../console/messages.fns";
import { Hint, SectionTitle } from "../../components/form/text";
import { DetailSkeleton } from "../../components/page/page-skeleton";
import { appName } from "../../shared/scope";
import { DefinitionList } from "../../components/page/definition-list";

const crumbs = [{ label: "Messages", to: "/messages" }, { label: "Message" }];

export const Route = createFileRoute("/_app/messages_/$messageId")({
  validateSearch: (search: Record<string, unknown>): { images?: boolean } => ({
    images: search.images === true || search.images === "true" ? true : undefined,
  }),
  loaderDeps: ({ search }) => ({ images: search.images }),
  loader: ({ params, deps }) => fetchMessage({ data: { id: params.messageId, images: deps.images } }),
  pendingComponent: () => <DetailSkeleton crumbs={crumbs} action />,
  component: MessagePage,
});

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function MessagePage() {
  const result = Route.useLoaderData();
  const { images } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/messages/$messageId" });
  if (!result) {
    return <PageDenied crumbs={crumbs} />;
  }
  if ("missing" in result) {
    return <PageDenied crumbs={crumbs} reason="not-found" label="Message not found" />;
  }
  const m = result.message;
  const appLabel = appName(shell.apps, m.appId, "App");
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
          <DefinitionList
            items={[
              { term: "From", value: m.fromEmail ?? "—", wrap: true },
              { term: "To", value: m.toEmail ?? "—", wrap: true },
              { term: "App", value: appLabel },
              { term: "Status", value: <StatusBadge status={m.status} direction={m.direction} /> },
            ]}
          />
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
