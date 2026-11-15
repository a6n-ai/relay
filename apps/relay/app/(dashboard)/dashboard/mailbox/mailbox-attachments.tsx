import { Panel } from "@/components/ds/panel";
import { IconTile } from "@/components/ds/icon-tile";
import { attachmentIcon, formatSize } from "./attachment-format";

export type ChatAttachment = {
  publicId: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
};

/** Plain anchors, not ResourceRow: a Next Link would fetch the file and then download it again. */
export function MailboxAttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  return (
    <Panel as="ul" className="w-full divide-y divide-border">
      {attachments.map((file) => (
        <li key={file.publicId}>
          <a
            href={`/api/mailbox/attachments/${file.publicId}`}
            aria-label={`Download ${file.filename}, ${formatSize(file.sizeBytes)}`}
            className="flex h-12 items-center gap-3 px-3 text-sm outline-none transition-[background-color] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none"
          >
            <IconTile icon={attachmentIcon(file.contentType, file.filename)} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {`${file.filename} · ${formatSize(file.sizeBytes)}`}
            </span>
          </a>
        </li>
      ))}
    </Panel>
  );
}
