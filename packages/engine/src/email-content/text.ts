// ponytail: naive tag-strip for the plaintext fallback. Good enough for a text
// part; upgrade to a real html-to-text pass if deliverability complains.
export function htmlToText(html: string): string {
  let s = html;
  for (;;) {
    const lower = s.toLowerCase();
    const start = lower.indexOf("<style");
    if (start < 0) break;
    const end = lower.indexOf("</style>", start);
    if (end < 0) {
      s = s.slice(0, start);
      break;
    }
    s = s.slice(0, start) + s.slice(end + 8);
  }
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "<") {
      const close = s.indexOf(">", i + 1);
      if (close < 0) break;
      out += " ";
      i = close + 1;
      continue;
    }
    out += s[i];
    i += 1;
  }
  return out
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
