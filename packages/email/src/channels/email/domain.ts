import { generateKeyPairSync, randomBytes } from "node:crypto";

export type DnsRecordPurpose = "ownership" | "spf" | "dkim" | "dmarc";

export interface DnsRecord {
  type: "TXT" | "CNAME" | "MX";
  /** Host relative to the sending domain (Hostinger-style), e.g. `_relay-verify`. */
  host: string;
  value: string;
  purpose: DnsRecordPurpose;
}

export const DOMAIN_VERIFY_HOST = "_relay-verify";
export const DOMAIN_VERIFY_PREFIX = "relay-domain-verify=";
export const DEFAULT_DKIM_SELECTOR = "relay";

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.$/, "");
}

export function generateDomainVerifyToken(): string {
  return randomBytes(16).toString("hex");
}

export function pemToDkimPublic(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

export function generateDkimKeyPair(): { publicKeyPem: string; privateKeyPem: string; dkimP: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey, dkimP: pemToDkimPublic(publicKey) };
}

export function ownershipTxtValue(token: string): string {
  return `${DOMAIN_VERIFY_PREFIX}${token}`;
}

export function buildSendingDomainRecords(opts: {
  domain: string;
  token: string;
  dkimSelector?: string;
  dkimP?: string;
  /** SPF include, e.g. `amazonses.com` or the SMTP provider's SPF domain. */
  spfInclude?: string;
  dmarcRua?: string;
}): DnsRecord[] {
  const domain = normalizeDomain(opts.domain);
  const selector = opts.dkimSelector ?? DEFAULT_DKIM_SELECTOR;
  const records: DnsRecord[] = [
    {
      type: "TXT",
      host: DOMAIN_VERIFY_HOST,
      value: ownershipTxtValue(opts.token),
      purpose: "ownership",
    },
    {
      type: "TXT",
      host: "@",
      value: opts.spfInclude
        ? `v=spf1 include:${opts.spfInclude} ~all`
        : "v=spf1 mx ~all",
      purpose: "spf",
    },
    {
      type: "TXT",
      host: "_dmarc",
      value: `v=DMARC1; p=quarantine; rua=mailto:${opts.dmarcRua ?? `dmarc@${domain}`}`,
      purpose: "dmarc",
    },
  ];
  if (opts.dkimP) {
    records.splice(2, 0, {
      type: "TXT",
      host: `${selector}._domainkey`,
      value: `v=DKIM1; k=rsa; p=${opts.dkimP}`,
      purpose: "dkim",
    });
  }
  return records;
}

export type ResolveTxt = (hostname: string) => Promise<string[][]>;

function flattenTxt(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(""));
}

export async function txtValuesInclude(
  hostname: string,
  needle: string,
  resolveTxt: ResolveTxt,
): Promise<boolean> {
  try {
    const values = flattenTxt(await resolveTxt(hostname));
    return values.some((v) => v.includes(needle));
  } catch {
    return false;
  }
}

/** Ownership TXT at `_relay-verify.<domain>`. */
export async function verifySendingDomainOwnership(
  domain: string,
  token: string,
  resolveTxt: ResolveTxt,
): Promise<boolean> {
  const host = `${DOMAIN_VERIFY_HOST}.${normalizeDomain(domain)}`;
  return txtValuesInclude(host, ownershipTxtValue(token), resolveTxt);
}
