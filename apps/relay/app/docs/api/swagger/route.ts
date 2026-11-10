const HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Swagger reference for the Relay HTTP API." />
    <title>Relay API — Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html, body { margin: 0; background: #0a0a0a; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <main>
      <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">Relay API reference (Swagger)</h1>
      <div id="swagger-ui"><p style="color:#a1a1a1;font:14px sans-serif;padding:16px">Loading API reference...</p></div>
    </main>
    <script>
      // Fetch the large bundle after the page has loaded so it never blocks first paint.
      window.addEventListener("load", function () {
        var s = document.createElement("script");
        s.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
        s.onload = function () {
          window.ui = SwaggerUIBundle({
            url: "/v1/openapi.json",
            dom_id: "#swagger-ui",
            persistAuthorization: true,
            withCredentials: true,
            deepLinking: true,
          });
        };
        document.body.appendChild(s);
      });
    </script>
  </body>
</html>
`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
