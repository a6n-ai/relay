import { parseDocument } from "htmlparser2";
import { isTag, type AnyNode } from "domhandler";
import { foreignPreheader, readPreheader, withPreheader } from "../preheader";
import { lintEmailHtml } from "../ui/email-compat";
import { findUnknownVariables } from "./variables";

export interface ChecklistItem {
  code: string;
  message: string;
}

function elements(html: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const walk = (nodes: AnyNode[]) => {
    for (const n of nodes) {
      if (!isTag(n)) continue;
      if (n.name.toLowerCase() === tag) out.push(n.attribs);
      walk(n.children);
    }
  };
  walk(parseDocument(html, { decodeEntities: false }).children);
  return out;
}

const LINK_OK = /^(https?:\/\/|mailto:|tel:)\S+/i;
const VARIABLE_LINK = /^\{\{\s*[\w.]+\s*(\|[^}]*)?\}\}/;

/** hrefs a recipient could not follow: relative, empty, `#`, or a bare domain. Anchors without href are ignored. */
export function invalidLinks(html: string): string[] {
  return elements(html, "a")
    .filter((a) => "href" in a)
    .map((a) => a.href.trim())
    .filter((href) => !LINK_OK.test(href) && !VARIABLE_LINK.test(href));
}

/** Images with no alt attribute at all. `alt=""` is a deliberate "decorative" marker and passes. */
export function imagesMissingAlt(html: string): number {
  return elements(html, "img").filter((img) => !("alt" in img)).length;
}

/**
 * What must be true before a campaign can send (blocking), and what an admin
 * should look at first (warnings). Run on the server for the send and schedule
 * routes, and shown on the Review step.
 */
export function campaignChecklist(input: {
  channel: string;
  subject: string;
  html: string | null;
  body: string | null;
  footerConfigured: boolean;
  eligible: number;
  known: readonly string[];
}): { blocking: ChecklistItem[]; warnings: ChecklistItem[] } {
  const blocking: ChecklistItem[] = [];
  const warnings: ChecklistItem[] = [];
  const email = input.channel === "email";
  const content = (email ? input.html : input.body) ?? "";

  if (!input.subject.trim()) blocking.push({ code: "subject", message: email ? "Add a subject line." : "Add a title." });
  if (!content.trim()) blocking.push({ code: "content", message: "The message is empty." });
  if (email && !input.footerConfigured) {
    blocking.push({
      code: "footer",
      message: "Sender details are not configured, so the unsubscribe footer can't be added. Ask an engineer to set them.",
    });
  }
  if (email) {
    const bad = invalidLinks(content);
    if (bad.length) {
      blocking.push({
        code: "links",
        message: `${bad.length} link(s) won't work: ${bad.slice(0, 3).map((b) => b || "(empty)").join(", ")}`,
      });
    }
  }
  const unknown = findUnknownVariables(`${input.subject}\n${content}`, input.known);
  if (unknown.length) blocking.push({ code: "variables", message: `Unknown variables: ${unknown.join(", ")}` });
  if (input.eligible < 1) blocking.push({ code: "recipients", message: "No one is eligible to receive this." });

  if (email && content.trim()) {
    if (!readPreheader(content) && !foreignPreheader(content)) {
      warnings.push({ code: "preheader", message: "No preview text — inboxes will show the first words of the email." });
    }
    const missing = imagesMissingAlt(content);
    if (missing) warnings.push({ code: "alt", message: `${missing} image(s) have no alt text.` });
    // Our own hidden preview-text block uses overflow:hidden; it is not the author's to fix.
    const lint = lintEmailHtml(withPreheader(content, ""));
    if (lint.length) warnings.push({ code: "compat", message: `${lint.length} style(s) may not render in every email client.` });
  }
  return { blocking, warnings };
}
