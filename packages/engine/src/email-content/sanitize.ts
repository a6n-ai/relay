import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { isComment, isTag, isText, type AnyNode, type Element } from "domhandler";
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
// Remote loads a letter can trigger when opened: the ones "block" mode strips.
const REMOTE_LOAD_ATTRS = new Set(["src", "srcset", "background", "poster"]);
const SVG_LOAD_TAGS = new Set(["image", "use", "feimage"]);
// Loose on purpose: a browser decodes CSS escapes and entities before it reads a function or at-rule name.
const CSS_NAME = /(?:\\[0-9a-f]{1,6}\s?|\\[^\n\r\f0-9a-f]|&#?[0-9a-z]+;?|[a-z0-9_-]|[^\x00-\x7f])+/.source;
const CSS_CALL = new RegExp(`(${CSS_NAME})\\(([^)]*)\\)?`, "gi");
const CSS_IMPORT = new RegExp(`@(${CSS_NAME})[^;{}]*;?`, "gi");

// Entities and whitespace/control chars are how `javascript:` gets disguised.
// decodeHTML covers named (&colon; &Tab;), numeric and legacy no-semicolon forms, as a browser does.
function normalizeUrl(value: string): string {
  return decodeHTML(value).replace(/[\u0000- ]/g, "").toLowerCase();
}

function unsafeUrl(attr: string, tag: string, value: string): boolean {
  const v = normalizeUrl(value);
  if (v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("cid:")) return true;
  if (v.startsWith("data:")) return !(attr === "src" && tag === "img" && v.startsWith("data:image/"));
  return false;
}

function isRemoteUrl(value: string): boolean {
  const v = normalizeUrl(value);
  return v.startsWith("https:") || v.startsWith("http:") || v.startsWith("//");
}

function cssUnescape(s: string): string {
  return s.replace(/\\([0-9a-f]{1,6})\s?|\\([^\n\r\f0-9a-f])/gi, (_, hex?: string, ch?: string) => {
    if (ch) return ch;
    const n = parseInt(hex ?? "", 16);
    return n === 0 || n > 0x10ffff ? "�" : String.fromCodePoint(n);
  });
}

function cssIdent(raw: string): string {
  return cssUnescape(decodeHTML(raw)).trim().toLowerCase();
}

function cssUrlTarget(raw: string): string {
  return cssUnescape(decodeHTML(raw)).trim().replace(/^(['"])(.*)\1$/, "$2").trim();
}

export type SanitizeOptions = { remoteImages?: "allow" | "block" };

export function sanitizeEmailHtml(
  html: string,
  opts: SanitizeOptions = {},
): { html: string; removed: string[]; blockedRemote: number } {
  const block = opts.remoteImages === "block";
  const removed: string[] = [];
  let blockedRemote = 0;
  // Judged on decoded names and targets, edited in the raw text. Only inline data:image url()s survive.
  const scrubCss = (css: string) => {
    let prev: string;
    do {
      prev = css;
      css = css
        .replace(CSS_IMPORT, (m, name: string) => {
          if (cssIdent(name) !== "import") return m;
          blockedRemote++;
          return "";
        })
        .replace(CSS_CALL, (m, name: string, arg: string) => {
          if (cssIdent(name) !== "url" || /^data:image\//i.test(cssUrlTarget(arg))) return m;
          blockedRemote++;
          return "none";
        });
    } while (css !== prev);
    return css;
  };
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
      const fontLink = tag === "link" && SAFE_FONT_CSS.test(el.attribs.href ?? "");
      if (block && fontLink) {
        blockedRemote++;
        drop(el);
        continue;
      }
      if (
        DROP_TAGS.has(tag) ||
        (inForeign && DROP_IN_FOREIGN.has(tag)) ||
        (tag === "link" && !fontLink)
      ) {
        removed.push(`<${tag}>`);
        drop(el);
        continue;
      }
      for (const name of Object.keys(el.attribs)) {
        const lower = name.toLowerCase();
        const value = el.attribs[name] ?? "";
        const svgLoad = lower === "xlink:href" || (lower === "href" && SVG_LOAD_TAGS.has(tag));
        if (lower.startsWith("on") || lower === "srcdoc") {
          removed.push(`${name} on <${tag}>`);
          delete el.attribs[name];
        } else if (URL_ATTRS.has(lower) && unsafeUrl(lower, tag, value)) {
          removed.push(`unsafe ${lower} on <${tag}>`);
          delete el.attribs[name];
        } else if (block && (((REMOTE_LOAD_ATTRS.has(lower) || svgLoad) && isRemoteUrl(value)) || (lower === "srcset" && /https?:|\/\//i.test(value)))) {
          blockedRemote++;
          delete el.attribs[name];
        } else if (lower === "style" && /expression\s*\(|javascript:/i.test(normalizeUrl(value))) {
          removed.push(`unsafe style on <${tag}>`);
          delete el.attribs[name];
        } else if (block && lower === "style") {
          // Attribute text is entity-encoded; the browser decodes it before reading CSS.
          const css = decodeHTML(value);
          const scrubbed = scrubCss(css);
          if (scrubbed !== css) el.attribs[name] = scrubbed.replace(/&/g, "&amp;");
        }
      }
      if (block && tag === "style" && !inForeign) {
        for (const child of el.children) if (isText(child)) child.data = scrubCss(child.data);
      }
      walk(el.children, inForeign || tag === "svg" || tag === "math");
    }
  };
  walk(doc.children, false);

  return { html: render(doc, { decodeEntities: false, encodeEntities: false }), removed, blockedRemote };
}
