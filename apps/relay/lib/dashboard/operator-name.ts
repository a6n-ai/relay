const PRODUCT_NAME = "relay";

export function operatorFirstName(user?: { name?: string | null; email?: string | null } | null): string {
  const first = user?.name?.trim().split(/\s+/)[0];
  if (first && first.toLowerCase() !== PRODUCT_NAME) return first;
  return user?.email?.split("@")[0] || "there";
}
