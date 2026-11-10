import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { Element, Text, isTag, isText, type AnyNode, type ChildNode } from "domhandler";
import { decodeHTML } from "entities";

export type ReaderLetter = { body: string; quoted: string | null; signature: string | null };

// Output is injected with dangerouslySetInnerHTML: this file is a security boundary.
// The tree is REBUILT from an allowlist (tags, attrs), never mutated in place.
const ALLOWED_TAGS = new Set(
  ("p div span br hr a b strong i em u s strike del ins sub sup small blockquote q code pre ul ol li dl dt dd " +
    "h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr td th caption").split(" "),
);
const DROP_TAGS = new Set(
  ("script style head title meta link iframe frame frameset object embed applet form input button select textarea " +
    "option noscript template svg math video audio picture source canvas map area xmp noembed noframes plaintext base").split(
    " ",
  ),
);
const COLLAPSIBLE = new Set(["div", "span", "p"]);

const SAFE_HREF = /^(https?:|mailto:)/;

function safeHref(value: string): string | null {
  const normalised = decodeHTML(value).replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase();
  return SAFE_HREF.test(normalised) ? value.trim() : null;
}

function classes(el: Element): string[] {
  return (el.attribs.class ?? "").toLowerCase().split(/\s+/);
}

function textOf(node: AnyNode): string {
  if (isText(node)) return node.data;
  if (isTag(node) && node.name === "br") return "\n";
  return "children" in node ? (node.children as AnyNode[]).map(textOf).join("") : "";
}

function find(nodes: ChildNode[], pred: (el: Element) => boolean): Element | null {
  for (const node of nodes) {
    if (!isTag(node)) continue;
    if (pred(node)) return node;
    const hit = find(node.children, pred);
    if (hit) return hit;
  }
  return null;
}

function isQuoteStart(el: Element): boolean {
  const c = classes(el);
  return (
    c.includes("gmail_quote") ||
    c.includes("gmail_quote_container") ||
    c.includes("yahoo_quoted") ||
    (el.name === "blockquote" && (el.attribs.type ?? "").toLowerCase() === "cite") ||
    el.attribs.id === "appendonsend" ||
    el.attribs.id === "divRplyFwdMsg" ||
    (el.name === "div" && el.attribs.name === "messageReplySection")
  );
}

function isSignature(el: Element): boolean {
  if (classes(el).some((c) => c === "gmail_signature" || c === "moz-signature")) return true;
  if (el.attribs["data-smartmail"] === "gmail_signature") return true;
  return el.name === "div" && /^\s*--[  ](\r?\n|$)/.test(textOf(el));
}

function detach(el: Element, withFollowing: boolean): ChildNode[] {
  const siblings = el.parent?.children;
  if (!siblings) return [el];
  const at = siblings.indexOf(el);
  const removed = siblings.splice(at, withFollowing ? siblings.length - at : 1);
  return removed;
}

function build(nodes: ChildNode[]): ChildNode[] {
  const out: ChildNode[] = [];
  for (const node of nodes) {
    if (isText(node)) {
      out.push(new Text(node.data));
      continue;
    }
    if (!isTag(node)) continue; // comments, directives, CDATA
    const tag = node.name.toLowerCase();
    if (tag === "img") {
      const alt = (node.attribs.alt ?? "").trim();
      if (alt) out.push(new Text(`[${alt}]`));
      continue;
    }
    if (DROP_TAGS.has(tag)) continue;
    const children = build(node.children);
    if (!ALLOWED_TAGS.has(tag)) {
      out.push(...children);
      continue;
    }
    const attribs: Record<string, string> = {};
    if (tag === "a") {
      const href = safeHref(node.attribs.href ?? "");
      if (href) Object.assign(attribs, { href, target: "_blank", rel: "noopener noreferrer nofollow" });
    } else if (tag === "td" || tag === "th") {
      for (const name of ["colspan", "rowspan"]) {
        if (/^\d{1,3}$/.test(node.attribs[name] ?? "")) attribs[name] = node.attribs[name];
      }
    }
    const el = new Element(tag, attribs, children);
    for (const child of children) child.parent = el;
    out.push(el);
  }
  return out;
}

const isBr = (n: ChildNode) => isTag(n) && n.name === "br";
const isBlank = (n: ChildNode) => isText(n) && n.data.trim() === "";

function tidy(nodes: ChildNode[]): ChildNode[] {
  let list = nodes.map((n) => {
    if (isTag(n)) {
      n.children = tidy(n.children);
      for (const child of n.children) child.parent = n;
    }
    return n;
  });
  list = list.filter((n) => !(isTag(n) && COLLAPSIBLE.has(n.name) && n.children.every((c) => isBr(c) || isBlank(c))));
  const collapsed: ChildNode[] = [];
  let run = 0;
  for (const n of list) {
    run = isBr(n) ? run + 1 : 0;
    if (run <= 2) collapsed.push(n);
  }
  while (collapsed.length && (isBr(collapsed[0]) || isBlank(collapsed[0]))) collapsed.shift();
  while (collapsed.length && (isBr(collapsed[collapsed.length - 1]) || isBlank(collapsed[collapsed.length - 1]))) {
    collapsed.pop();
  }
  return collapsed;
}

function toReaderHtml(nodes: ChildNode[]): string {
  return render(tidy(build(nodes)), { encodeEntities: "utf8" }).trim();
}

export function emailHtmlToReader(html: string): ReaderLetter {
  const doc = parseDocument(html);
  const bodyEl = find(doc.children, (el) => el.name === "body");
  const root = bodyEl ? bodyEl.children : doc.children;
  const holder = new Element("div", {}, root);
  for (const child of root) child.parent = holder;

  const quoteEl = find(holder.children, isQuoteStart);
  const quotedNodes = quoteEl
    ? detach(quoteEl, quoteEl.attribs.id === "appendonsend" || quoteEl.attribs.id === "divRplyFwdMsg")
    : [];
  const sigEl = find(holder.children, isSignature);
  const sigNodes = sigEl ? detach(sigEl, false) : [];
  // Gmail leaves the "-- " marker in a sibling span.
  const prefix = find(holder.children, (el) => classes(el).includes("gmail_signature_prefix"));
  if (prefix) detach(prefix, false);

  const quoted = toReaderHtml(quotedNodes);
  const signature = toReaderHtml(sigNodes);
  return { body: toReaderHtml(holder.children), quoted: quoted || null, signature: signature || null };
}

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function plainToHtml(text: string): string {
  const trimmed = text.replace(/^\s*\n/, "").trimEnd();
  let out = "";
  let last = 0;
  for (const m of trimmed.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    out += escapeText(trimmed.slice(last, m.index));
    out += `<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeText(url)}</a>`;
    last = m.index + url.length;
  }
  out += escapeText(trimmed.slice(last));
  return out.replace(/\r?\n/g, "<br>");
}

export function emailTextToReader(text: string): ReaderLetter {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let cut = lines.findIndex((l) => /^On .+ wrote:\s*$/.test(l) || l.startsWith(">"));
  if (cut === -1) cut = lines.length;
  const quotedLines = lines.slice(cut).map((l) => l.replace(/^(>\s?)+/, ""));
  const head = lines.slice(0, cut);
  const sigAt = head.findIndex((l) => /^-- ?$/.test(l));
  const bodyLines = sigAt === -1 ? head : head.slice(0, sigAt);
  const sigLines = sigAt === -1 ? [] : head.slice(sigAt + 1);

  const part = (ls: string[]) => (ls.join("\n").trim() ? plainToHtml(ls.join("\n")) : null);
  return { body: part(bodyLines) ?? "", quoted: part(quotedLines), signature: part(sigLines) };
}
