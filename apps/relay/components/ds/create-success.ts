export type CreatedItem = {
  /** What was made, for the toast title ("Campaign" gives "Campaign created"). */
  noun?: string;
  name: string;
  /** Where to open the new item; the toast shows a View link only when this is set. */
  href?: string;
  /** A one-time secret (access key, signing secret) that must stay on screen until dismissed. */
  secret?: string;
};

export type CreateToast = {
  title: string;
  description: string;
  viewHref: string | null;
  secret: string | null;
  /** True when the toast must wait for the person to dismiss it. */
  persistent: boolean;
};

/** A save worked when the result carries no error. */
export function isCreateSuccess(result: { error?: string | null } | null | undefined): boolean {
  return result != null && !result.error;
}

/** What to tell the person after a create dialog closes. */
export function createSuccessToast(item: CreatedItem): CreateToast {
  const name = item.name.trim() || "Untitled";
  return {
    title: item.noun ? `${item.noun} created` : "Created",
    description: name,
    viewHref: item.href ?? null,
    secret: item.secret ?? null,
    persistent: item.secret != null,
  };
}
