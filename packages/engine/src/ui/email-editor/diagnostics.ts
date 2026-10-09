import { variableTokens } from "../../email-content/variables";
import { lintEmailHtml } from "../email-compat";

export interface EditorDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
}

/** Inline problems for the code pane: unknown `{{vars}}` (error) and email-client compatibility (warning, HTML only). */
export function editorDiagnostics(doc: string, opts: { language: "html" | "tsx"; known: readonly string[] }): EditorDiagnostic[] {
  const known = new Set(opts.known);
  const out: EditorDiagnostic[] = variableTokens(doc)
    .filter((t) => !known.has(t.key))
    .map((t) => ({
      from: t.from,
      to: t.to,
      severity: "error" as const,
      message: `Unknown variable {{${t.key}}} — not available for this email`,
    }));
  if (opts.language === "html") {
    const lineStarts = [0];
    for (let i = 0; i < doc.length; i++) if (doc[i] === "\n") lineStarts.push(i + 1);
    for (const w of lintEmailHtml(doc)) {
      const from = lineStarts[w.line - 1] ?? 0;
      const end = doc.indexOf("\n", from);
      out.push({ from, to: end < 0 ? doc.length : end, severity: "warning", message: `${w.property} isn't supported in ${w.clients}` });
    }
  }
  return out;
}
