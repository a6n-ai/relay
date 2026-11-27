// Shapes the console UI and the server modules both read. Type-only: nothing here may import app code.
import type { WorkspaceStatus } from "./limits";
import type { OrgRole } from "./roles";
import type { Stream, SuppressionReason } from "./mail";

type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "sent" | "cancelled";

export type CampaignView = {
  id: string;
  appId: string;
  name: string;
  status: CampaignStatus;
  fromEmail: string | null;
  subject: string;
  html: string;
  text: string;
  listIds: string[];
  audienceKind: "lists" | "hook";
  audienceQuery: string | null;
  scheduledAt: number | null;
  runSeq: number;
  startedAt: number | null;
  finishedAt: number | null;
  recipients: number;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AudiencePreview = { members: number; suppressed: number; lapsed: number; sendable: number };

export type CampaignStats = {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  suppressed: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
};

export type ConsentSource = "purchase" | "express_optin" | "event_signup" | "import_other";

type MemberState = "subscribed" | "suppressed";

export type ListView = {
  id: string;
  appId: string;
  name: string;
  consentSource: ConsentSource;
  consentNote: string | null;
  members: number;
  createdAt: number;
};

export type MemberView = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  source: "manual" | "import";
  consentAt: number;
  state: MemberState;
  optedOut: string[];
  createdAt: number;
};

export type TemplateView = {
  id: string;
  appId: string;
  name: string;
  event: string | null;
  locale: string;
  subject: string;
  intro: string | null;
  html: string;
  text: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AutomationView = {
  id: string;
  appId: string;
  name: string;
  listId: string;
  templateId: string;
  fromEmail: string;
  delayHours: number;
  enabled: boolean;
  pending: number;
  sent: number;
  skipped: number;
  createdAt: number;
  updatedAt: number;
};

// No payloadKey and no response body: the console shows status, attempts and the fixed reason only.
export type DeliveryView = {
  id: string;
  messageId: string;
  event: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
};

export type Shell = {
  user: { id: string; email: string; name: string };
  platformAdmin: boolean;
  active: { id: string; name: string; slug: string; status: WorkspaceStatus; roles: OrgRole[] } | null;
  workspaces: { id: string; name: string }[];
  apps: { id: string; name: string }[];
};

export type BlockSource = "link" | "one-click" | "admin" | "ses";
export type BlockView = { email: string; reason: SuppressionReason; stream: Stream | null; source: BlockSource | null; campaignRef: string | null; campaignName: string | null; createdAt: number };
export type BlockQuery = { reasons?: SuppressionReason[]; streams?: (Stream | "all")[]; sources?: BlockSource[]; from?: number; to?: number; search?: string; sort?: "time" | "address" | "stream" | "reason"; dir?: "asc" | "desc"; offset?: number; limit?: number };
export type BlockSummary = Record<"total" | "last30" | "thisMonth", Record<SuppressionReason, number>>;
