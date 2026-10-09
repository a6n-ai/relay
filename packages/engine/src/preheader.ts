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
  const body = /<body[^>]*>/i.exec(stripped);
  if (!body) return block + stripped;
  const at = body.index + body[0].length;
  return stripped.slice(0, at) + block + stripped.slice(at);
}
