import { parseDocument } from "htmlparser2";
import { isTag, isText, type AnyNode } from "domhandler";
import { decodeHTML } from "entities";

// Never part of what a reader sees: document head, CSS, scripts. Comments
// (including MSO conditional blocks) are skipped by only collecting text nodes.
const SKIP = new Set(["head", "title", "style", "script"]);

/** The plain-text part: visible text only, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  const parts: string[] = [];
  const walk = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (isText(node)) parts.push(decodeHTML(node.data));
      else if (isTag(node) && !SKIP.has(node.name.toLowerCase())) {
        walk(node.children);
        parts.push(" "); // element boundaries separate words (<p>a</p><p>b</p> → "a b")
      }
    }
  };
  walk(parseDocument(html, { decodeEntities: false }).children);
  return parts
    .join("")
    .replace(/[​-‍͏﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
