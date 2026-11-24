export type CampaignDraft = {
  from: string;
  subject: string;
  html: string;
  text: string;
  audienceKind?: string;
  audienceQuery?: string | null;
};
export function isDirty(saved: CampaignDraft, form: CampaignDraft): boolean {
  return (
    saved.from !== form.from ||
    saved.subject !== form.subject ||
    saved.html !== form.html ||
    saved.text !== form.text ||
    saved.audienceKind !== form.audienceKind ||
    saved.audienceQuery !== form.audienceQuery
  );
}
