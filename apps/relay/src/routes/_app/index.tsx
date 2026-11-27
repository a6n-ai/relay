import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import { fetchOverview } from "../../console/overview.fns";
import { SITE_ORIGIN } from "../../shared/site";

// Overview and its shell pieces load only when it renders, never on the signed-out landing page.
const OverviewView = lazy(() => import("../../components/overview"));
const OverviewSkeleton = lazy(() =>
  import("../../components/page/page-skeleton").then(({ CardsSkeleton }) => ({ default: () => <CardsSkeleton /> })),
);

const DESCRIPTION = "One API for transactional email, campaigns and inbound mail, with signed webhooks and a console your whole team can read.";

const landingHead = () => ({
  meta: [
    { title: "Relay: email API, campaigns and webhooks" },
    { name: "description", content: DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Relay" },
    { property: "og:title", content: "Relay: email API, campaigns and webhooks" },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: SITE_ORIGIN },
    { property: "og:image", content: `${SITE_ORIGIN}/landing/og.png` },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Relay: send email with one request and see what happens next." },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Relay: email API, campaigns and webhooks" },
    { name: "twitter:description", content: DESCRIPTION },
    { name: "twitter:image", content: `${SITE_ORIGIN}/landing/og.png` },
  ],
  links: [
    { rel: "canonical", href: SITE_ORIGIN },
    { rel: "preload", as: "font", type: "font/woff2", href: geistLatin, crossOrigin: "anonymous" as const },
  ],
  scripts: [
    {
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Relay",
        url: SITE_ORIGIN,
        description: DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        publisher: { "@type": "Organization", name: "a6n", url: "https://a6n.ai" },
      }),
    },
  ],
});

export const Route = createFileRoute("/_app/")({
  staticData: { title: "Overview", copy: "How your messages are doing this month." },
  // Marketing meta applies only when the landing page renders, not to the signed-in Overview.
  head: ({ match }: { match: { context: { landing?: boolean } } }) => (match.context.landing ? landingHead() : {}),
  // A signed-out visitor sees the landing page, but child loaders still run; skip the fetch for them.
  loader: ({ context }) => (context.shell ? fetchOverview() : (null as never)),
  pendingComponent: () => (
    <Suspense fallback={null}>
      <OverviewSkeleton />
    </Suspense>
  ),
  component: Overview,
});

function Overview() {
  const overview = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  return (
    <Suspense fallback={null}>
      <OverviewView overview={overview} shell={shell} />
    </Suspense>
  );
}

