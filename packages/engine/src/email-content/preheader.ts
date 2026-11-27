// Inbox preview text, stored inside the html itself so campaign_content needs
// no new column. Marked so we only ever replace our own, never an author's.
const ATTR = "data-relay-preheader";
const OURS = new RegExp(`<div ${ATTR}[^>]*>([\\s\\S]*?)</div>`, "i");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

export function readPreheader(html: string): string {
  const m = OURS.exec(html);
  return m ? unesc(m[1]!) : "";
}

export function withPreheader(html: string, text: string): string {
  const stripped = html.replace(OURS, "");
  if (!text.trim()) return stripped;
  const block =
    `<div ${ATTR} style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0">` +
    `${esc(text.trim())}</div>`;
  const body = /<body\b[^<>]*>/i.exec(stripped);
  if (!body) return block + stripped;
  const at = body.index + body[0].length;
  return stripped.slice(0, at) + block + stripped.slice(at);
}

// An author's own hidden preview text (e.g. a pasted campaign): the first
// display:none div/span in the html that isn't ours. Read-only — we never edit it.
// A tag scan, not one regex: a single backtracking pattern was polynomial on hostile html.
const OPEN_TAG = /<(div|span)\b([^<>]*)>/gi;

export function foreignPreheader(html: string): string {
  const lower = html.toLowerCase();
  // Once a tag name has no close after some point, it has none after any later one: search each name's tail once.
  const unclosed = new Set<string>();
  for (const m of html.matchAll(OPEN_TAG)) {
    const attrs = m[2]!;
    if (attrs.includes(ATTR)) continue;
    const style = /style="([^"]*)"/i.exec(attrs)?.[1];
    if (!style || !/display\s*:\s*none/i.test(style)) continue;
    const from = m.index! + m[0].length;
    const name = m[1]!.toLowerCase();
    if (unclosed.has(name)) continue;
    const to = lower.indexOf(`</${name}>`, from);
    if (to < 0) {
      unclosed.add(name);
      continue;
    }
    const text = html.slice(from, to).replace(/<[^<>]*>/g, " ").replace(/&[#\w]+;/g, " ");
    return text.replace(/[\s͏‌]+/g, " ").trim();
  }
  return "";
}
