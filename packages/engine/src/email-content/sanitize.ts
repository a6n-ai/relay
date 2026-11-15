import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { isComment, isTag, isText, type AnyNode, type Element } from "domhandler";
import { decodeHTML } from "entities";

// Email HTML is untrusted input (pasted or AI-generated). Parse → walk → drop
// what can execute or exfiltrate; keep everything email layouts depend on:
// <style>, MSO conditional comments, entities, doctype, inline styles.
const DROP_TAGS = new Set([
  "script", "iframe", "object", "embed", "form", "base", "meta", "frame", "frameset", "applet",
  // Raw-text containers htmlparser2 and browsers disagree on — classic mXSS vectors.
  "noscript", "xmp", "noembed", "noframes", "plaintext", "template",
]);
// Inside svg/math browsers parse these as markup, not raw text, so their "text" can break out.
const DROP_IN_FOREIGN = new Set(["style", "title", "foreignobject"]);
// SMIL can set an element's href at render time (`<set attributeName="href">`), with no script.
const SVG_ANIMATION_TAGS = new Set(["set", "animate", "animatemotion", "animatetransform", "animatecolor", "discard", "mpath"]);
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "background", "poster", "xlink:href"]);
const SAFE_FONT_CSS = /^https:\/\/fonts\.googleapis\.com\//i;
// Remote loads a letter can trigger when opened: the ones "block" mode strips.
const REMOTE_LOAD_ATTRS = new Set(["src", "background", "poster"]);
const SVG_LOAD_TAGS = new Set(["image", "use", "feimage"]);
// Judged on decoded text. `\` counts as `/` in a url, so `/\host` reaches the same remote host as `//host`.
const CSS_REMOTE = /https?:|[\\/]{2}/i;
const CSS_IMPORT = /@import\b/i;

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

// HTML attribute URLs have no CSS escapes; browsers read `\` as `/` in them, so `/\host` is `//host`.
function judgeAttrUrl(v: string): string {
  return decodeHTML(v).replace(URL_NOISE, "").replace(/\\/g, "/").toLowerCase();
}

function isRemoteUrl(value: string): boolean {
  const v = judgeAttrUrl(value);
  return v.startsWith("https:") || v.startsWith("http:") || v.startsWith("//");
}

// Decoded before splitting, as the browser does, so `&#44;` cannot hide a candidate boundary.
function isRemoteSrcset(value: string): boolean {
  return decodeHTML(value).split(",").some(isRemoteUrl);
}

function cssUnescape(s: string): string {
  return s.replace(/\\([0-9a-f]{1,6})\s?|\\([^\n\r\f0-9a-f])/gi, (_, hex?: string, ch?: string) => {
    if (ch) return ch;
    const n = parseInt(hex ?? "", 16);
    return n === 0 || n > 0x10ffff ? "�" : String.fromCodePoint(n);
  });
}

// Browsers drop these from a URL before fetching it, so the remote test must too.
const URL_NOISE = /[\u0000- \u007f]/g;

function judgeCss(raw: string): string {
  return cssUnescape(decodeHTML(raw).replace(/\\(\r\n|[\n\r\f])/g, "")).replace(URL_NOISE, "");
}

type Scrubbed = { out: string; dropped: number };

// Index of the next `stops` char at top level, skipping quotes, comments, escapes and brackets.
// -1 at a clean end; throws when quotes or brackets never close.
function nextStop(css: string, from: number, stops: string): number {
  let depth = 0;
  let quote = "";
  for (let i = from; i < css.length; i++) {
    const c = css[i];
    if (c === "\\") i++;
    else if (quote) {
      if (c === quote || c === "\n" || c === "\r" || c === "\f") quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) throw new Error("unclosed comment");
      i = end + 1;
    } else if (depth === 0 && stops.includes(c)) return i;
    else if (c === "(" || c === "{") depth++;
    else if (c === ")" || c === "}") {
      if (--depth < 0) throw new Error("unbalanced bracket");
    }
  }
  if (quote || depth) throw new Error("unclosed quote or bracket");
  return -1;
}

// Unparseable CSS is dropped whole rather than guessed at.
function failClosed(scrub: () => Scrubbed): Scrubbed {
  try {
    return scrub();
  } catch {
    return { out: "", dropped: 1 };
  }
}

function keepDeclarations(css: string): Scrubbed {
  let out = "";
  let dropped = 0;
  for (let pos = 0; pos < css.length; ) {
    const stop = nextStop(css, pos, ";");
    const end = stop < 0 ? css.length : stop + 1;
    const declaration = css.slice(pos, end);
    if (CSS_REMOTE.test(judgeCss(declaration))) dropped++;
    else out += declaration;
    pos = end;
  }
  return { out, dropped };
}

// Kept text is the raw text, so a sheet with nothing remote comes back byte-for-byte.
function keepSheet(css: string): Scrubbed {
  let out = "";
  let dropped = 0;
  let pos = 0;
  while (pos < css.length) {
    const stop = nextStop(css, pos, ";{");
    if (stop < 0 || css[stop] === ";") {
      const end = stop < 0 ? css.length : stop + 1;
      const statement = css.slice(pos, end);
      const judged = judgeCss(statement);
      if (CSS_IMPORT.test(judged) || CSS_REMOTE.test(judged)) dropped++;
      else out += statement;
      pos = end;
      continue;
    }
    const close = nextStop(css, stop + 1, "}");
    if (close < 0) throw new Error("unclosed rule");
    const head = css.slice(pos, stop + 1);
    const rule = css.slice(pos, close + 1);
    const body = css.slice(stop + 1, close);
    pos = close + 1;
    if (CSS_IMPORT.test(judgeCss(rule)) || CSS_REMOTE.test(judgeCss(head))) {
      dropped++;
      continue;
    }
    const inner = nextStop(body, 0, "{") < 0 ? keepDeclarations(body) : keepSheet(body);
    out += head + inner.out + "}";
    dropped += inner.dropped;
  }
  return { out, dropped };
}

export type SanitizeOptions = { remoteImages?: "allow" | "block" };

export function sanitizeEmailHtml(
  html: string,
  opts: SanitizeOptions = {},
): { html: string; removed: string[]; blockedRemote: number } {
  const block = opts.remoteImages === "block";
  const removed: string[] = [];
  let blockedRemote = 0;
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
        SVG_ANIMATION_TAGS.has(tag) ||
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
        } else if (block && (((REMOTE_LOAD_ATTRS.has(lower) || svgLoad) && isRemoteUrl(value)) || (lower === "srcset" && isRemoteSrcset(value)))) {
          blockedRemote++;
          delete el.attribs[name];
        } else if (lower === "style" && /expression\s*\(|javascript:/i.test(normalizeUrl(value))) {
          removed.push(`unsafe style on <${tag}>`);
          delete el.attribs[name];
        } else if (block && lower === "style") {
          // Attribute text is entity-encoded; the browser decodes it before reading CSS.
          const { out, dropped } = failClosed(() => keepDeclarations(decodeHTML(value)));
          if (dropped) {
            blockedRemote += dropped;
            el.attribs[name] = out.replace(/&/g, "&amp;");
          }
        }
      }
      if (block && tag === "style" && !inForeign) {
        for (const child of el.children) {
          if (!isText(child)) continue;
          const { out, dropped } = failClosed(() => keepSheet(child.data));
          blockedRemote += dropped;
          child.data = out;
        }
      }
      walk(el.children, inForeign || tag === "svg" || tag === "math");
    }
  };
  walk(doc.children, false);

  return { html: render(doc, { decodeEntities: false, encodeEntities: false }), removed, blockedRemote };
}
