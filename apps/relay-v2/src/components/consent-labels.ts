import type { ConsentSource } from "../do/lists";

export const CONSENT_LABEL: Record<ConsentSource, string> = {
  purchase: "Customer (purchase)",
  express_optin: "Opted in",
  event_signup: "Event sign-up",
  import_other: "Other",
};
