import type { PageData } from "../src/components/shell/page-data";

const sources = import.meta.glob("../src/routes/_app/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// The routes' own `staticData`, read from the route files (they cannot load outside the Worker build), so a route change reaches the shell tests.
const pages: Record<string, PageData> = {};
for (const text of Object.values(sources)) {
  const m = text.match(/createFileRoute\("\/_app([^"]*)"\)[\s\S]*?staticData:\s*\{([^}]*)\}/);
  if (!m) continue;
  const title = m[2].match(/title:\s*"([^"]*)"/)?.[1];
  if (!title) continue;
  const scoped = m[2].match(/scoped:\s*"([^"]*)"/)?.[1];
  const to = m[1].replaceAll("_/", "/") || "/";
  pages[to] = { title, ...(scoped ? { scoped: scoped as PageData["scoped"] } : {}) };
}

export const pageOf = (to: string) => pages[to];
