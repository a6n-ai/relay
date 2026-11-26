import type { ConsentSource } from "../do/lists";

export const CONSENT_LABEL: Record<ConsentSource, string> = {
  purchase: "They bought from you",
  express_optin: "They asked to hear from you",
  event_signup: "They signed up at an event",
  import_other: "Another source",
};

export const consentHint = (source: ConsentSource) => `They are added with the list's consent: ${CONSENT_LABEL[source].toLowerCase()}.`;
