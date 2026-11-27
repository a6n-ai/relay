import { z } from "zod";
import { EMAIL_MAX, ID_MAX, SUBJECT_MAX } from "./limits";

export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX).email();
export const idSchema = z.string().min(1).max(ID_MAX);
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const slugSchema = z.string().regex(SLUG_RE);

export const noLineBreak = (s: string) => !/[\r\n]/.test(s);
// A subject becomes a mail header: a line break would split it.
export const subjectSchema = z.string().max(SUBJECT_MAX).refine(noLineBreak, "subject must not contain line breaks");
