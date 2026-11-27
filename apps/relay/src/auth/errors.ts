import { isAPIError } from "better-auth/api";
import { RelayError, type Status } from "../shared/errors";

// A better-auth refusal keeps its own text and answers with one of the statuses its call site passes through. Every other refusal below 500 is
// `other`; with no `other` it is not translated at all and the caller's error handling sees it as it came.
const RULES: Record<"member" | "workspace" | "create", { keep: readonly number[]; other?: Status }> = {
  member: { keep: [403, 404, 429], other: 400 },
  workspace: { keep: [403, 404], other: 400 },
  create: { keep: [400, 401, 403] },
};

export function authError(err: unknown, rule: keyof typeof RULES): unknown {
  if (!isAPIError(err) || err.statusCode >= 500) return err;
  const { keep, other } = RULES[rule];
  const status = keep.includes(err.statusCode) ? (err.statusCode as Status) : other;
  return status === undefined ? err : new RelayError("auth refused", status, err.message);
}
