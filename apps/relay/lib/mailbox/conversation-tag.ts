export function conversationTagSlug(label: string): string | null {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug || slug.length > 32) return null;
  return slug;
}

export function tagFilterKey(slug: string): string {
  return `tag:${slug}`;
}

export function isTagFilterKey(key: string): boolean {
  return key.startsWith("tag:");
}
