import { type ConsentSource } from "../../shared/views";

export const CONSENT_LABEL: Record<ConsentSource, string> = {
  purchase: "They bought from you",
  express_optin: "They asked to hear from you",
  event_signup: "They signed up at an event",
  import_other: "Another source",
};

export const CONSENT_SHORT: Record<ConsentSource, string> = {
  purchase: "Customer",
  express_optin: "Opted in",
  event_signup: "Event signup",
  import_other: "Other source",
};

export const consentHint = (source: ConsentSource) => `They are added with the list's consent: ${CONSENT_LABEL[source].toLowerCase()}.`;
