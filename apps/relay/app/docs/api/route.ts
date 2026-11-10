import { ApiReference } from "@scalar/nextjs-api-reference";

const scalar = ApiReference({
  url: "/v1/openapi.json",
  theme: "purple",
  pageTitle: "Relay API reference",
});

// The renderer emits a bare document, so add the semantics it omits.
export async function GET() {
  const res = scalar();
  const html = (await res.text())
    .replace("<html>", '<html lang="en">')
    .replace("</title>", '</title>\n    <meta name="description" content="Interactive reference for the Relay HTTP API: send messages, manage apps, people, campaigns and more." />')
    .replace(
      '<div id="app"></div>',
      '<main>\n      <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">Relay API reference</h1>\n      <div id="app"></div>\n    </main>',
    );
  return new Response(html, { status: res.status, headers: res.headers });
}
