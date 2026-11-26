import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
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
import { isDirty } from "./campaign-dirty";
import { ConfirmDialog } from "./confirm-dialog";
import { PROBLEM_LABEL } from "./campaign-problems";
import { ContentFields, type LetterPreview } from "./content-fields";
import { errorText } from "./error-text";
import { ScheduleDialog } from "./schedule-dialog";
import { SettingsCard } from "./page/settings-card";
import { Toolbar } from "./page/toolbar";
import { UnsavedGuard } from "./unsaved-guard";
import { useCan } from "./use-can";
import { FormError, FormActions, FormPanel, FormBody } from "./page/form-parts";
import { Hint } from "./page/text";

export type CampaignOptions = { senders: string[]; lists: ListView[]; postalAddress: string | null };

export function CampaignEditor({
  campaign,
  options,
  hookReady,
}: {
  campaign: CampaignView;
  options: CampaignOptions;
  hookReady: boolean;
}) {
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
  const [audienceKind, setAudienceKind] = useState(campaign.audienceKind);
  const [audienceQuery, setAudienceQuery] = useState(campaign.audienceQuery ?? "");
  const [audience, setAudience] = useState<{ sendable: number; suppressed: number; lapsed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [address, setAddress] = useState(options.postalAddress ?? "");
  const dirty = isDirty(
    {
      from: campaign.fromEmail ?? "",
      subject: campaign.subject,
      html: campaign.html,
      text: campaign.text,
      audienceKind: campaign.audienceKind,
      audienceQuery: campaign.audienceQuery,
      listIds: campaign.listIds,
    },
    { from, subject, html, text, audienceKind, listIds, audienceQuery: audienceQuery.trim() || null },
  );
  const leaving = useRef(false);

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
      audienceKind: campaign.audienceKind,
      hookReady,
    },
    options.postalAddress,
  );

  // Returns the error text when the save failed, null when it worked or nothing was unsaved.
  async function persist(): Promise<string | null> {
    setPending(true);
    setError(null);
    try {
      await updateCampaignFn({
        data: {
          id: campaign.id,
          patch: {
            fromEmail: from || null,
            subject,
            html,
            text,
            listIds,
            audienceKind,
            audienceQuery: audienceQuery.trim() || null,
          },
        },
      });
      toast.success("Campaign saved");
      await router.invalidate();
      return null;
    } catch (err) {
      const message = errorText(err, "Could not save this campaign.");
      setError(message);
      return message;
    } finally {
      setPending(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await persist();
  }

  // Preview, test send and schedule read the saved row, so they save unsaved edits first.
  const saveFirst = (): Promise<string | null> => (dirty ? persist() : Promise.resolve(null));

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

  async function previewLetter(): Promise<LetterPreview | null> {
    if (await saveFirst()) return null;
    return (await previewHtmlFn({ data: { id: campaign.id } })) ?? null;
  }

  async function sendTest() {
    if (await saveFirst()) return;
    try {
      const result = await testSendCampaignFn({ data: { id: campaign.id } });
      if (result.status === "suppressed") toast.error("Your address is suppressed");
      else if (result.status === "failed") toast.error("The test could not be sent");
      else toast.success("Test sent to your email");
    } catch (err) {
      toast.error(errorText(err, "Could not send the test."));
    }
  }

  async function remove() {
    await deleteCampaignFn({ data: { id: campaign.id } });
    toast.success("Campaign deleted");
    leaving.current = true;
    await navigate({ to: "/campaigns", search: { appId: campaign.appId } });
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

  const schedule = canSend ? (
    problems.length === 0 ? (
      <ScheduleDialog campaignId={campaign.id} beforeSubmit={saveFirst} onDone={() => router.invalidate()} />
    ) : (
      <Button disabled>
        Schedule…
      </Button>
    )
  ) : null;

  return (
    <>
      <UnsavedGuard when={dirty} bypass={leaving} />
      <Toolbar>
        {canWrite ? (
          <Button type="submit" form="campaign-form" variant="outline" disabled={pending || !dirty}>
            Save
          </Button>
        ) : null}
        {canWrite ? (
          <Button variant="outline" onClick={sendTest}>
            Send test to me
          </Button>
        ) : null}
        {schedule}
      </Toolbar>

      <FormPanel as="form" id="campaign-form" onSubmit={save}>
        <SettingsCard title="Content">
          <FormBody as="div">
            <Label htmlFor="campaign-from">From</Label>
            <Select value={from} onValueChange={(v) => setFrom(v ?? "")} disabled={!canWrite}>
              <SelectTrigger id="campaign-from" aria-label="From">
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
            <ContentFields
              value={{ subject, html, text }}
              onChange={(next) => {
                setSubject(next.subject);
                setHtml(next.html);
                setText(next.text);
              }}
              dataFields={campaign.audienceKind === "hook"}
              disabled={!canWrite}
              onPreview={previewLetter}
            />
            <FormError message={error} />
          </FormBody>
        </SettingsCard>

        <SettingsCard title="Audience">
          <fieldset className="grid gap-2">
            <legend className="sr-only">Audience</legend>
            <RadioGroup
              value={audienceKind}
              onValueChange={(v) => setAudienceKind(v as "lists" | "hook")}
              aria-label="Audience"
              className="grid gap-2"
            >
              <Label htmlFor="audience-lists" className="font-normal">
                <RadioGroupItem id="audience-lists" value="lists" disabled={!canWrite} />
                Lists
              </Label>
              <Label htmlFor="audience-hook" className="font-normal">
                <RadioGroupItem id="audience-hook" value="hook" disabled={!canWrite || !hookReady} />
                App audience
              </Label>
            </RadioGroup>
            {audienceKind === "hook" ? (
              <>
                <Label htmlFor="campaign-audience-query">Audience filter</Label>
                <Input
                  id="campaign-audience-query"
                  value={audienceQuery}
                  disabled={!canWrite}
                  onChange={(e) => setAudienceQuery(e.target.value)}
                />
                <Hint>Counted when it sends</Hint>
              </>
            ) : (
              <>
                {options.lists.length === 0 ? <Hint>No lists in this app yet.</Hint> : null}
                {options.lists.map((l) => (
                  <Label key={l.id} className="font-normal">
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
              </>
            )}
          </fieldset>
        </SettingsCard>
      </FormPanel>

      <FormPanel>
        <SettingsCard title="Before it can be sent">
          {problems.length === 0 ? (
            <Hint>Ready to schedule.</Hint>
          ) : (
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {problems.map((p) => (
                <li key={p}>{PROBLEM_LABEL[p]}</li>
              ))}
            </ul>
          )}
          {problems.includes("postal_address_missing") && canSettings ? (
            <form onSubmit={savePostalAddress} className="mt-3 grid gap-2">
              <Label htmlFor="campaign-postal">Postal address</Label>
              <Input id="campaign-postal" value={address} onChange={(e) => setAddress(e.target.value)} />
              <FormActions>
                <Button type="submit" disabled={!address.trim()}>
                  Save address
                </Button>
              </FormActions>
            </form>
          ) : null}
        </SettingsCard>

        {canWrite ? (
          <SettingsCard
            tone="danger"
            title="Delete campaign"
            description="The draft and its body will be removed. This can't be undone."
            action={
              <ConfirmDialog
                trigger="Delete"
                title="Delete this campaign?"
                description="The draft and its body will be removed. This can't be undone."
                confirmLabel="Delete"
                onConfirm={remove}
              />
            }
          />
        ) : null}
      </FormPanel>
    </>
  );
}
