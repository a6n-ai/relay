import { apiFetch } from "./api-fetch";

// Every inbox fetches images from outside the app, so a relative url is a broken image.
export function absoluteUrl(url: string, origin: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  return new URL(url, origin).toString();
}

/** `onUploadImage` for EmailEditor: the app's public image upload, never the secured store. */
export async function uploadEmailImage(file: File): Promise<{ url: string }> {
  const body = new FormData();
  body.set("file", file);
  body.set("prefix", "campaign-images");
  const detail = await apiFetch<{ url: string }>("/api/files/upload", { method: "POST", body });
  return { url: absoluteUrl(detail.url, window.location.origin) };
}
