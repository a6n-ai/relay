const HINT_EXTENSIONS: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
};

// A UI hint only: the server re-checks by sniffing.
export function previewHint(contentType: string, filename: string): boolean {
  const media = contentType.split(";")[0].trim().toLowerCase();
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return HINT_EXTENSIONS[media]?.includes(ext) ?? false;
}
