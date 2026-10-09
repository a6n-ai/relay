import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { isTag, type AnyNode, type Element } from "domhandler";

// Email HTML is untrusted input (pasted or AI-generated). Parse → walk → drop
// what can execute or exfiltrate; keep everything email layouts depend on:
// <style>, MSO conditional comments, entities, doctype, inline styles.
const DROP_TAGS = new Set(["script", "iframe", "object", "embed", "form", "base", "frame", "frameset", "applet"]);
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "background", "poster", "xlink:href"]);
const SAFE_FONT_CSS = /^https:\/\/fonts\.googleapis\.com\//i;

// Entities and whitespace/control chars are how `javascript:` gets disguised.
function normalizeUrl(value: string): string {
  return value
    .replace(/&#(x?)([0-9a-f]+);?/gi, (_m, hex: string, n: string) => String.fromCharCode(parseInt(n, hex ? 16 : 10)))
    .replace(/[\u0000- ]/g, "")
    .toLowerCase();
}

function unsafeUrl(attr: string, tag: string, value: string): boolean {
  const v = normalizeUrl(value);
  if (v.startsWith("javascript:") || v.startsWith("vbscript:")) return true;
  if (v.startsWith("data:")) return !(attr === "src" && tag === "img" && v.startsWith("data:image/"));
  return false;
}

export function sanitizeEmailHtml(html: string): { html: string; removed: string[] } {
  const removed: string[] = [];
  const doc = parseDocument(html, { decodeEntities: false, lowerCaseAttributeNames: false, recognizeSelfClosing: true });

  const walk = (nodes: AnyNode[]) => {
    for (const node of [...nodes]) {
      if (!isTag(node)) continue;
      const el = node as Element;
      const tag = el.name.toLowerCase();
      if (DROP_TAGS.has(tag) || (tag === "link" && !SAFE_FONT_CSS.test(el.attribs.href ?? ""))) {
        removed.push(`<${tag}>`);
        const siblings = el.parent ? el.parent.children : doc.children;
        siblings.splice(siblings.indexOf(el), 1);
        continue;
      }
      for (const name of Object.keys(el.attribs)) {
        const lower = name.toLowerCase();
        const value = el.attribs[name] ?? "";
        if (lower.startsWith("on") || lower === "srcdoc") {
          removed.push(`${name} on <${tag}>`);
          delete el.attribs[name];
        } else if (URL_ATTRS.has(lower) && unsafeUrl(lower, tag, value)) {
          removed.push(`unsafe ${lower} on <${tag}>`);
          delete el.attribs[name];
        } else if (lower === "style" && /expression\s*\(|javascript:/i.test(normalizeUrl(value))) {
          removed.push(`unsafe style on <${tag}>`);
          delete el.attribs[name];
        }
      }
      walk(el.children);
    }
  };
  walk(doc.children);

  return { html: render(doc, { decodeEntities: false, encodeEntities: false }), removed };
}
