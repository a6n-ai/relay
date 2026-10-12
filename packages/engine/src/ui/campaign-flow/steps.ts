export type FlowStep = "content" | "audience" | "review";

export const FLOW_STEPS: readonly { key: FlowStep; label: string }[] = [
  { key: "content", label: "Content" },
  { key: "audience", label: "Audience" },
  { key: "review", label: "Review & Send" },
];

export function parseStep(value: string | undefined): FlowStep {
  return FLOW_STEPS.some((s) => s.key === value) ? (value as FlowStep) : "content";
}

/** What each step needs before Continue; the server re-checks all of it at send (campaignChecklist). */
export function stepGate(input: { hasSubject: boolean; hasContent: boolean; eligible: number | null }) {
  const canLeaveContent = input.hasSubject && input.hasContent;
  const canLeaveAudience = canLeaveContent && (input.eligible ?? 0) > 0;
  let reason: string | null = null;
  if (!input.hasSubject) reason = "Add a subject line to continue.";
  else if (!input.hasContent) reason = "Add the email content to continue.";
  else if (input.eligible === 0) {
    reason = "No one is eligible — everyone in this audience is unsubscribed, suppressed or missing consent.";
  }
  return { canLeaveContent, canLeaveAudience, reason };
}
