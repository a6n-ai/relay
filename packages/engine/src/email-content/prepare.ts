import { withPreheader } from "../preheader";
import { lintEmailHtml, type CompatWarning } from "../ui/email-compat";
import { sanitizeEmailHtml } from "./sanitize";
import { htmlToText } from "./text";
import { findUnknownVariables } from "./variables";

export interface PreparedEmail {
  html: string;
  text: string;
  removed: string[];
  unknownVariables: string[];
  lint: CompatWarning[];
}

/** The single server-side pass every saved email goes through. */
export function prepareEmailContent(input: {
  html: string;
  preheader: string;
  subject: string;
  source: string;
  known: readonly string[];
}): PreparedEmail {
  const { html: clean, removed } = sanitizeEmailHtml(input.html);
  const html = withPreheader(clean, input.preheader);
  return {
    html,
    text: htmlToText(html),
    removed,
    unknownVariables: findUnknownVariables(`${input.subject}\n${input.source}\n${html}`, input.known),
    lint: lintEmailHtml(html),
  };
}
