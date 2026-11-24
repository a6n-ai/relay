import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { toast } from "@foundry/ui/toast";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import {
  deleteCampaignFn,
  previewAudienceFn,
  previewHtmlFn,
  setPostalAddressFn,
  testSendCampaignFn,
  updateCampaignFn,
} from "../console/campaigns.fns";
import type { CampaignView } from "../do/campaigns";
import type { ListView } from "../do/lists";
import { campaignProblems } from "../core/campaign-problems";
import { ConfirmDialog } from "./confirm-dialog";
import { PROBLEM_LABEL } from "./campaign-problems";
import { errorText } from "./error-text";
import { FormError } from "./form-error";
import { LetterView } from "./letter-view";
import { ScheduleDialog } from "./schedule-dialog";
import { StatusBadge } from "./status-badge";
import { useCan } from "./use-can";

export type CampaignOptions = { senders: string[]; lists: ListView[]; postalAddress: string | null };
type Preview = { htmlSafe: string; text: string; subject: string };

export function CampaignEditor({ campaign, options }: { campaign: CampaignView; options: CampaignOptions }) {
  const router = useRouter();
  const navigate = useNavigate();
  const canWrite = useCan({ campaign: ["write"] });
  const canSend = useCan({ campaign: ["send"] });
  const canSettings = useCan({ settings: ["write"] });
  const [from, setFrom] = useState(campaign.fromEmail ?? "");
  const [subject, setSubject] = useState(campaign.subject);
  const [html, setHtml] = useState(campaign.html);
  const [text, setText] = useState(campaign.text);
  const [listIds, setListIds] = useState(campaign.listIds);
  const [audience, setAudience] = useState<{ sendable: number; suppressed: number; lapsed: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [address, setAddress] = useState(options.postalAddress ?? "");

  // The audience is counted from the saved campaign, so it reloads whenever the saved lists change.
  const savedLists = campaign.listIds.join(",");
  useEffect(() => {
    let live = true;
    previewAudienceFn({ data: { id: campaign.id } })
      .then((a) => live && setAudience(a ?? null))
      .catch(() => live && setAudience(null));
    return () => {
      live = false;
    };
  }, [campaign.id, savedLists]);

  const problems = campaignProblems(
    {
      fromEmail: campaign.fromEmail,
      subject: campaign.subject,
      html: campaign.html,
      text: campaign.text,
      listIds: campaign.listIds,
    },
    options.postalAddress,
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await updateCampaignFn({
        data: { id: campaign.id, patch: { fromEmail: from || null, subject, html, text, listIds } },
      });
      toast.success("Campaign saved");
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not save this campaign."));
    } finally {
      setPending(false);
    }
  }

  async function toggleList(listId: string, on: boolean) {
    const next = on ? [...listIds, listId] : listIds.filter((x) => x !== listId);
    setListIds(next);
    try {
      await updateCampaignFn({ data: { id: campaign.id, patch: { listIds: next } } });
      await router.invalidate();
    } catch (err) {
      setListIds(campaign.listIds);
      toast.error(errorText(err, "Could not update the lists."));
    }
  }

  async function showPreview() {
    try {
      setPreview((await previewHtmlFn({ data: { id: campaign.id } })) ?? null);
    } catch (err) {
      toast.error(errorText(err, "Could not load the preview."));
    }
  }

  async function sendTest() {
    try {
      await testSendCampaignFn({ data: { id: campaign.id } });
      toast.success("Test sent to your email");
    } catch (err) {
      toast.error(errorText(err, "Could not send the test."));
    }
  }

  async function remove() {
    try {
      await deleteCampaignFn({ data: { id: campaign.id } });
      toast.success("Campaign deleted");
      await navigate({ to: "/campaigns", search: { appId: campaign.appId } });
    } catch (err) {
      toast.error(errorText(err, "Could not delete this campaign."));
    }
  }

  async function savePostalAddress(event: FormEvent) {
    event.preventDefault();
    try {
      await setPostalAddressFn({ data: { address } });
      toast.success("Postal address saved");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not save the postal address."));
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={campaign.status} />
        <span className="text-sm text-muted-foreground">{campaign.name}</span>
      </div>

      <form onSubmit={save} className="grid max-w-2xl gap-4">
        <Label htmlFor="campaign-from">From</Label>
        <Select value={from} onValueChange={(v) => setFrom(v ?? "")} disabled={!canWrite}>
          <SelectTrigger id="campaign-from" aria-label="From" className="w-full">
            <SelectValue placeholder="Choose a verified address" />
          </SelectTrigger>
          <SelectContent>
            {options.senders.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label htmlFor="campaign-subject">Subject</Label>
        <Input id="campaign-subject" value={subject} disabled={!canWrite} onChange={(e) => setSubject(e.target.value)} />

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Lists</legend>
          {options.lists.length === 0 ? <p className="text-sm text-muted-foreground">No lists in this app yet.</p> : null}
          {options.lists.map((l) => (
            <Label key={l.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={listIds.includes(l.id)}
                disabled={!canWrite}
                onCheckedChange={(on) => toggleList(l.id, on === true)}
              />
              {l.name}
            </Label>
          ))}
          {audience ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {audience.sendable} will receive this ({audience.suppressed} suppressed, {audience.lapsed} lapsed)
            </p>
          ) : null}
        </fieldset>

        <Label htmlFor="campaign-html">HTML</Label>
        <Textarea id="campaign-html" rows={10} value={html} disabled={!canWrite} onChange={(e) => setHtml(e.target.value)} />
        <Label htmlFor="campaign-text">Plain text</Label>
        <Textarea id="campaign-text" rows={6} value={text} disabled={!canWrite} onChange={(e) => setText(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Merge fields: {"{{contact.name}}"}, {"{{contact.first_name}}"}, {"{{contact.email}}"}, {"{{unsubscribe_url}}"},{" "}
          {"{{postal_address}}"}
        </p>

        <FormError message={error} />
        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={showPreview}>
          Preview
        </Button>
        {canWrite ? (
          <Button variant="outline" size="sm" onClick={sendTest}>
            Send test to me
          </Button>
        ) : null}
        {canWrite ? (
          <ConfirmDialog
            trigger="Delete"
            title="Delete this campaign?"
            description="The draft and its body will be removed. This can't be undone."
            confirmLabel="Delete"
            onConfirm={remove}
          />
        ) : null}
      </div>

      {preview ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">{preview.subject}</p>
          <LetterView htmlSafe={preview.htmlSafe} text={preview.text} blockedRemote={0} images={false} onShowImages={() => undefined} />
        </div>
      ) : null}

      <section className="grid max-w-2xl gap-3">
        <h2 className="text-sm font-medium">Before it can be sent</h2>
        {problems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ready to schedule.</p>
        ) : (
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {problems.map((p) => (
              <li key={p}>{PROBLEM_LABEL[p]}</li>
            ))}
          </ul>
        )}
        {problems.includes("postal_address_missing") && canSettings ? (
          <form onSubmit={savePostalAddress} className="grid gap-2">
            <Label htmlFor="campaign-postal">Postal address</Label>
            <Input id="campaign-postal" value={address} onChange={(e) => setAddress(e.target.value)} />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!address.trim()}>
                Save address
              </Button>
            </div>
          </form>
        ) : null}
        {canSend ? (
          problems.length === 0 ? (
            <ScheduleDialog campaignId={campaign.id} onDone={() => router.invalidate()} />
          ) : (
            <Button size="sm" disabled className="w-fit">
              Schedule…
            </Button>
          )
        ) : null}
      </section>
    </div>
  );
}
