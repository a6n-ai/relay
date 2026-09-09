import { apiFetch } from "./api-fetch";
import type { ListMeta } from "./contact-list-meta-fields";

export interface ManualContactInput {
  name: string;
  email?: string;
  phone?: string;
}

/**
 * Create a list, then add contacts to it in one call. Shared by CSV import
 * (after preview/selection) and manual entry — both end up with the same
 * plain contact array, so both go through the same `/members` endpoint
 * instead of one using multipart file upload and the other JSON.
 */
export async function createListWithContacts(
  meta: ListMeta,
  contacts: ManualContactInput[],
): Promise<{ publicId: string; imported: number }> {
  const created = await apiFetch<{ publicId: string }>("/api/notifications/contact-lists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: meta.name,
      consentSource: meta.consentSource,
      consentAt: Date.now(),
      consentNote: meta.consentNote || undefined,
    }),
  });

  const { imported } = await apiFetch<{ imported: number }>(
    `/api/notifications/contact-lists/${created.publicId}/members`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contacts }),
    },
  );

  return { publicId: created.publicId, imported };
}
