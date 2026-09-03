export type ComposeFromOption = {
  id: string;
  tenantPublicId: string | null;
  email: string;
  name: string | null;
  label: string;
};

/** One dropdown row per verified From. Operator default is first when set. */
export function composeFromOptions(input: {
  operator: { email: string; name?: string } | null;
  senders: Array<{
    publicId: string;
    email: string;
    displayName: string | null;
    verifiedAt: number | null;
    tenantPublicId: string;
    tenantName: string;
  }>;
}): ComposeFromOption[] {
  const out: ComposeFromOption[] = [];
  if (input.operator?.email) {
    const email = input.operator.email;
    const name = input.operator.name ?? null;
    out.push({
      id: "operator",
      tenantPublicId: null,
      email,
      name,
      label: name ? `${name} <${email}>` : email,
    });
  }
  for (const s of input.senders) {
    if (s.verifiedAt == null || !s.tenantPublicId) continue;
    const who = s.displayName ? `${s.displayName} <${s.email}>` : s.email;
    out.push({
      id: s.publicId,
      tenantPublicId: s.tenantPublicId,
      email: s.email,
      name: s.displayName,
      label: `${who} · ${s.tenantName}`,
    });
  }
  return out;
}
