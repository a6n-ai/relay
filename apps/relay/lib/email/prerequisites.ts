export type EmailPrereqStatus = "ready" | "missing";

export type EmailPrereq = {
  id: string;
  label: string;
  detail: string;
  status: EmailPrereqStatus;
};

export type EmailChannelSnapshot = {
  transport: "ses" | "smtp" | "none";
  fromEmail: string | null;
  fromName: string | null;
  smtpHost: string | null;
  bounceWebhookPath: string;
  verifiedDomainCount: number;
};

export function operatorEmailPrereqs(snap: EmailChannelSnapshot): EmailPrereq[] {
  const transportReady = snap.transport !== "none";
  const fromReady = Boolean(snap.fromEmail);
  return [
    {
      id: "identity",
      label: "Prove you own the domain",
      detail: "Add the DNS records we show on each app. Inbox providers need this before they trust your mail.",
      status: snap.verifiedDomainCount > 0 ? "ready" : "missing",
    },
    {
      id: "transport",
      label: "How Relay sends mail",
      detail: "Save a mail server under Email sending, or connect Amazon email. Until that’s done, nothing can leave.",
      status: transportReady ? "ready" : "missing",
    },
    {
      id: "from",
      label: "Default From address",
      detail: "Used when an app’s From (like info@tiffingrab.ca) isn’t ready yet.",
      status: fromReady ? "ready" : "missing",
    },
    {
      id: "bounces",
      label: "Bounces and spam reports",
      detail: "Tell your email provider to send bounce and spam reports back to Relay so we stop mailing bad addresses.",
      status: "ready",
    },
    {
      id: "alignment",
      label: "Domain matches the sender",
      detail: "The From domain should match what you proved in DNS. Important once you send a lot of mail.",
      status: snap.smtpHost || snap.transport === "ses" ? "ready" : "missing",
    },
  ];
}

export function emailChannelReady(prereqs: EmailPrereq[]): boolean {
  return prereqs.filter((p) => p.id === "transport" || p.id === "from").every((p) => p.status === "ready");
}
