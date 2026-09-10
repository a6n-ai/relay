"use client";

import { useState } from "react";
import { PaperclipIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@foundry/ui/file-upload";
import { apiFetch } from "./api-fetch";

export interface CampaignAttachment {
  filename: string;
  url: string;
  contentType: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Email-only. Uploads through the app's /api/notifications/campaigns/attachments
 * route (a broader mime allowlist than the general image-upload endpoint), and
 * hands back {filename, url, contentType} refs for the campaign content payload
 * — the file itself is fetched by url at send time, not carried in the draft.
 */
export function CampaignAttachments({
  value,
  onChange,
}: {
  value: CampaignAttachment[];
  onChange: (v: CampaignAttachment[]) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return toast.error(`${file.name} is larger than 10MB`);
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const detail = await apiFetch<{ url: string; fileName: string; type?: string }>(
        "/api/notifications/campaigns/attachments",
        { method: "POST", body },
      );
      onChange([...value, { filename: detail.fileName, url: detail.url, contentType: detail.type ?? file.type }]);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((a, i) => (
            <li key={`${a.url}-${i}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 truncate">
                <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
                {a.filename}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              >
                <XIcon className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FileUpload
        disabled={busy}
        multiple
        onUpload={async (files, options) => {
          for (const file of files) {
            try {
              await upload(file);
              options.onSuccess(file);
            } catch (e) {
              options.onError(file, e instanceof Error ? e : new Error("Upload failed"));
            }
          }
        }}
      >
        <FileUploadDropzone className="border-dashed">
          <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
            <PaperclipIcon className="size-4" />
            <span>{busy ? "Uploading…" : "Drop files to attach"}</span>
          </div>
          <FileUploadTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={busy}>
              Add attachment
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
    </div>
  );
}
