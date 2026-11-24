import { hasMergeToken } from "./merge";

// Pure and free of tldts, so the console can import it: the client bundle must not carry the domain parser.
export type CampaignProblem =
  | "from_missing"
  | "subject_missing"
  | "html_missing"
  | "text_missing"
  | "audience_empty"
  | "audience_hook_missing"
  | "unsubscribe_missing"
  | "postal_address_missing";

export function campaignProblems(
  c: {
    fromEmail: string | null;
    subject: string;
    html: string;
    text: string;
    listIds: string[];
    audienceKind: "lists" | "hook";
    hookReady: boolean;
  },
  postalAddress: string | null,
): CampaignProblem[] {
  const problems: CampaignProblem[] = [];
  if (!c.fromEmail) problems.push("from_missing");
  if (!c.subject.trim()) problems.push("subject_missing");
  if (!c.html.trim()) problems.push("html_missing");
  if (!c.text.trim()) problems.push("text_missing");
  if (c.audienceKind === "lists" && c.listIds.length === 0) problems.push("audience_empty");
  if (c.audienceKind === "hook" && !c.hookReady) problems.push("audience_hook_missing");
  const bodies = [c.html, c.text];
  if (bodies.some((b) => !hasMergeToken(b, "unsubscribe_url"))) problems.push("unsubscribe_missing");
  if (!postalAddress?.trim() || bodies.some((b) => !hasMergeToken(b, "postal_address"))) problems.push("postal_address_missing");
  return problems;
}
