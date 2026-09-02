/** Typed error bodies for a future people-mail host. No live IMAP in CI. */
export const PEOPLE_MAIL_ERRORS = {
  unauthorized: { status: 401, code: "unauthorized", title: "Couldn’t sign in to manage addresses" },
  exists: { status: 409, code: "exists", title: "That address is already in use" },
  invalid: { status: 400, code: "invalid", title: "That is not a valid mail address" },
  quota: { status: 400, code: "quota", title: "This domain has no more addresses" },
  sending_domain: {
    status: 400,
    code: "sending_domain",
    title: "Use a people domain, not the domain Relay sends receipts from",
  },
} as const;

export type PeopleMailErrorCode = keyof typeof PEOPLE_MAIL_ERRORS;

export class PeopleMailError extends Error {
  readonly status: number;
  readonly code: PeopleMailErrorCode;

  constructor(code: PeopleMailErrorCode) {
    const body = PEOPLE_MAIL_ERRORS[code];
    super(body.title);
    this.name = "PeopleMailError";
    this.code = code;
    this.status = body.status;
  }

  toJSON() {
    return PEOPLE_MAIL_ERRORS[this.code];
  }
}

export function normalizeMailDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

export function domainOfMailboxEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return normalizeMailDomain(email.slice(at + 1));
}

export function assertPeopleMailboxEmail(
  email: string,
  sendingDomains: readonly string[],
): { local: string; domain: string } {
  const trimmed = email.trim().toLowerCase();
  const domain = domainOfMailboxEmail(trimmed);
  const local = trimmed.slice(0, trimmed.indexOf("@"));
  if (!domain || !local || local.includes(" ")) {
    throw new PeopleMailError("invalid");
  }
  const sending = new Set(sendingDomains.map(normalizeMailDomain));
  if (sending.has(domain)) throw new PeopleMailError("sending_domain");
  return { local, domain };
}

export type PeopleMailDnsHint = {
  type: "MX" | "SRV";
  host: string;
  value: string;
  purpose: "Mail for this domain";
};

/**
 * DNS copy for a people mailbox host. Values are placeholders for a real vendor
 * (Fastmail / Workspace / Migadu / a Stalwart VM). Never SES SMTP hostnames.
 */
export function dnsHints(
  peopleDomain: string,
  opts: { sendingHostnames: readonly string[] },
): PeopleMailDnsHint[] {
  const domain = normalizeMailDomain(peopleDomain);
  if (!domain) throw new PeopleMailError("invalid");
  const sending = opts.sendingHostnames.map(normalizeMailDomain);
  if (sending.includes(domain)) throw new PeopleMailError("sending_domain");
  const hints: PeopleMailDnsHint[] = [
    { type: "MX", host: "@", value: `mx1.${domain}`, purpose: "Mail for this domain" },
    { type: "MX", host: "@", value: `mx2.${domain}`, purpose: "Mail for this domain" },
    { type: "SRV", host: "_imaps._tcp", value: `0 1 993 imap.${domain}`, purpose: "Mail for this domain" },
  ];
  for (const host of sending) {
    if (!host) continue;
    for (const hint of hints) {
      const tokens = hint.value.toLowerCase().split(/\s+/);
      if (hint.value.toLowerCase() === host || tokens.includes(host)) {
        throw new PeopleMailError("sending_domain");
      }
    }
  }
  return hints;
}

export class MemoryPeopleMailClient {
  private readonly domains = new Set<string>();
  private readonly accounts = new Map<string, { disabled: boolean }>();

  constructor(
    private readonly opts: {
      secret: string;
      sendingDomains: readonly string[];
      sendingHostnames?: readonly string[];
      maxAccounts?: number;
    },
  ) {}

  ensureDomain(domain: string, authorization?: string): void {
    this.assertAuth(authorization);
    const d = normalizeMailDomain(domain);
    if (!d) throw new PeopleMailError("invalid");
    if (this.opts.sendingDomains.map(normalizeMailDomain).includes(d)) {
      throw new PeopleMailError("sending_domain");
    }
    dnsHints(d, { sendingHostnames: this.opts.sendingHostnames ?? [] });
    this.domains.add(d);
  }

  createAccount(email: string, authorization?: string): { email: string } {
    this.assertAuth(authorization);
    const { domain } = assertPeopleMailboxEmail(email, this.opts.sendingDomains);
    if (!this.domains.has(domain)) this.ensureDomain(domain, authorization);
    const key = email.trim().toLowerCase();
    if (this.accounts.has(key)) throw new PeopleMailError("exists");
    const max = this.opts.maxAccounts ?? 50;
    if (this.accounts.size >= max) throw new PeopleMailError("quota");
    this.accounts.set(key, { disabled: false });
    return { email: key };
  }

  disableAccount(email: string, authorization?: string): void {
    this.assertAuth(authorization);
    const key = email.trim().toLowerCase();
    const row = this.accounts.get(key);
    if (!row) throw new PeopleMailError("invalid");
    row.disabled = true;
  }

  private assertAuth(authorization?: string): void {
    if (authorization !== this.opts.secret) throw new PeopleMailError("unauthorized");
  }
}
