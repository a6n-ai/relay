// finalize: the SES send already happened; the job only records the SES id and never calls SES.
export type SendJob =
  | { kind?: "send"; workspaceId: string; messageId: string }
  | { kind: "finalize"; workspaceId: string; messageId: string; sesMessageId: string };

export type WebhookJob = { workspaceId: string; deliveryId: string };
export type InboundJob = {
  workspaceId: string;
  appId: string;
  addressId: string;
  personal?: boolean;
  rawKey: string;
  envelopeFrom: string;
  envelopeTo: string;
  authResults: string | null;
  receivedAt: number;
};
