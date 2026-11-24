import type { CampaignProblem } from "../core/campaign-problems";

export const PROBLEM_LABEL: Record<CampaignProblem, string> = {
  from_missing: "Choose a verified From address",
  subject_missing: "Add a subject",
  html_missing: "Add the HTML body",
  text_missing: "Add the plain text body",
  audience_empty: "Choose at least one list",
  audience_hook_missing: "Set up the App audience first",
  data_fields_need_hook: "{{data.*}} fields need the App audience, not a list",
  unsubscribe_missing: "Add {{unsubscribe_url}} to the HTML and plain text",
  postal_address_missing: "Add a postal address and {{postal_address}} to the body",
};
