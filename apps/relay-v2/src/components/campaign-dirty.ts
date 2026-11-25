export type CampaignDraft = {
  from: string;
  subject: string;
  html: string;
  text: string;
  audienceKind?: string;
  audienceQuery?: string | null;
  listIds?: string[];
};
export function isDirty(saved: CampaignDraft, form: CampaignDraft): boolean {
  return (
    saved.from !== form.from ||
    saved.subject !== form.subject ||
    saved.html !== form.html ||
    saved.text !== form.text ||
    saved.audienceKind !== form.audienceKind ||
    saved.audienceQuery !== form.audienceQuery ||
    sameIds(saved.listIds, form.listIds) === false
  );
}

function sameIds(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && [...a].sort().join("\0") === [...b].sort().join("\0");
}
