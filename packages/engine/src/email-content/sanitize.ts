import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { isComment, isTag, type AnyNode, type Element } from "domhandler";
import { decodeHTML } from "entities";

// Email HTML is untrusted input (pasted or AI-generated). Parse → walk → drop
// what can execute or exfiltrate; keep everything email layouts depend on:
// <style>, MSO conditional comments, entities, doctype, inline styles.
const DROP_TAGS = new Set([
  "script", "iframe", "object", "embed", "form", "base", "frame", "frameset", "applet",
  // Raw-text containers htmlparser2 and browsers disagree on — classic mXSS vectors.
  "noscript", "xmp", "noembed", "noframes", "plaintext", "template",
]);
// Inside svg/math browsers parse these as markup, not raw text, so their "text" can break out.
const DROP_IN_FOREIGN = new Set(["style", "title", "foreignobject"]);
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "background", "poster", "xlink:href"]);
const SAFE_FONT_CSS = /^https:\/\/fonts\.googleapis\.com\//i;

// Entities and whitespace/control chars are how `javascript:` gets disguised.
// decodeHTML covers named (&colon; &Tab;), numeric and legacy no-semicolon forms, as a browser does.
function normalizeUrl(value: string): string {
  return decodeHTML(value).replace(/[\u0000- ]/g, "").toLowerCase();
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

  const drop = (node: AnyNode) => {
    const siblings = node.parent ? node.parent.children : doc.children;
    siblings.splice(siblings.indexOf(node), 1);
  };

  const walk = (nodes: AnyNode[], inForeign: boolean) => {
    for (const node of [...nodes]) {
      // Browsers end a comment at `--!>`; htmlparser2 doesn't, so whatever follows would hide from us.
      if (isComment(node) && node.data.includes("--!>")) {
        removed.push("<!-- --!> comment");
        drop(node);
        continue;
      }
      if (!isTag(node)) continue;
      const el = node as Element;
      const tag = el.name.toLowerCase();
      if (
        DROP_TAGS.has(tag) ||
        (inForeign && DROP_IN_FOREIGN.has(tag)) ||
        (tag === "link" && !SAFE_FONT_CSS.test(el.attribs.href ?? ""))
      ) {
        removed.push(`<${tag}>`);
        drop(el);
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
      walk(el.children, inForeign || tag === "svg" || tag === "math");
    }
  };
  walk(doc.children, false);

  return { html: render(doc, { decodeEntities: false, encodeEntities: false }), removed };
}
