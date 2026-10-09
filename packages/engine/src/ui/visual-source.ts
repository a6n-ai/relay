// Visual mode saves the editor's own JSON document as `body` (html stays the
// composed email), like React mode saves its source. Re-parsing the composed
// html would nest the themed container again and lose Inspector document styles.
export const VISUAL_SOURCE_MARKER = "/*email-editor-json*/";

type JsonDoc = Record<string, unknown>;

export function toVisualSource(doc: JsonDoc): string {
  return VISUAL_SOURCE_MARKER + JSON.stringify(doc);
}

export function parseVisualSource(body: string): JsonDoc | null {
  if (!body.startsWith(VISUAL_SOURCE_MARKER)) return null;
  try {
    return JSON.parse(body.slice(VISUAL_SOURCE_MARKER.length)) as JsonDoc;
  } catch {
    return null;
  }
}
