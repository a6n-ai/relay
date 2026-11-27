export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

// A server error that names the slug belongs under the slug field, not in the form footer.
export function splitSlugError(error: string | null): { slug: string | null; rest: string | null } {
  const mine = !!error && /slug/i.test(error);
  return { slug: mine ? error : null, rest: mine ? null : error };
}
