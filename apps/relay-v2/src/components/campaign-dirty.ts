export type CampaignDraft = { from: string; subject: string; html: string; text: string };

export function isDirty(saved: CampaignDraft, form: CampaignDraft): boolean {
  return saved.from !== form.from || saved.subject !== form.subject || saved.html !== form.html || saved.text !== form.text;
}
