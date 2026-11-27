import { InlineScript } from "@foundry/ui/inline-script";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { themeBootScript } from "../components/shell/theme";
import { StateMessage } from "../components/denied-state";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Relay" },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }, { rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <StateMessage as="main" title="Page not found" body="It doesn't exist or has moved.">
      <Link to="/" className="inline-flex min-h-6 items-center justify-center text-sm underline">
        Back to Relay
      </Link>
    </StateMessage>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <InlineScript html={themeBootScript} />
        <HeadContent />
      </head>
      <body className="admin-ui">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
