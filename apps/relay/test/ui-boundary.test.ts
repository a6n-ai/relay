import { posix } from "node:path";
import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../src/{components,routes}/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// Pages and parts: components/ and the route files that render UI (not the server routes).
const SERVER_ROUTES = ["routes/api/", "routes/lists.$listId.export.ts", "routes/u.$token.ts"];
const ui = Object.entries(sources)
  .map(([path, text]) => [path.replace("../src/", ""), text] as const)
  .filter(([rel]) => rel.startsWith("components/") || !SERVER_ROUTES.some((s) => rel.startsWith(s)));

// The UI layer imports only shared/, components/, the console/*.fns.ts server functions, the router and the generated route tree.
// The root route alone may load the stylesheet by URL.
const allowed = (rel: string, target: string) =>
  (/^(shared|components|routes)\//.test(target) && !SERVER_ROUTES.some((s) => target.startsWith(s))) ||
  /^console\/[^/]+\.fns(\.tsx?)?$/.test(target) ||
  target === "router" ||
  target === "routeTree.gen" ||
  (rel === "routes/__root.tsx" && target === "styles.css?url");

describe("UI import boundary", () => {
  it("finds UI files", () => {
    expect(ui.length).toBeGreaterThan(50);
  });

  it("reaches the server layers only through console/*.fns.ts", () => {
    const bad: string[] = [];
    for (const [rel, text] of ui) {
      for (const m of text.matchAll(/(?:from|import\(?)\s*["'](\.[^"']+)["']/g)) {
        const target = posix.normalize(posix.join(posix.dirname(rel), m[1]));
        if (!allowed(rel, target)) bad.push(`${rel} -> ${target}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
