import { maskEmails } from "./mask-emails";

// DrizzleQueryError's message is "Failed query: <sql>\nparams: <bound values>". Only the error is logged, never the SQL or its
// values; the D1 error in its cause names the table and column. Any other "params:" tail is cut the same way.
function safeMessage(e: Error): string {
  if ("query" in e && "params" in e) return "Failed query";
  return e.message.split(/\s*\bparams:/)[0];
}

// Each error in the cause chain as "Name: message", outermost first. Emails are masked; bound values and request bodies are never logged.
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let depth = 0; e !== undefined && e !== null && depth < 5; depth++) {
    if (!(e instanceof Error)) {
      parts.push(String(e));
      break;
    }
    parts.push(`${e.name}: ${safeMessage(e)}`);
    e = e.cause;
  }
  return maskEmails(parts.join(" <- "));
}

function innermost(err: unknown): unknown {
  let e = err;
  while (e instanceof Error && e.cause instanceof Error) e = e.cause;
  return e;
}

// One line per failure: where, status, the cause chain. A 5xx also carries the innermost error's top frames.
export function logFailure(where: string, status: number, err: unknown): void {
  const line = `${where} ${status} ${describeError(err)}`;
  if (status < 500) return console.warn(line);
  const root = innermost(err);
  const frames = root instanceof Error ? (root.stack ?? "").split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 3) : [];
  console.error(frames.length ? `${line} | ${frames.map((f) => f.trim()).join(" | ")}` : line);
}

// The error sent to the browser carries only fixed copy; this keeps its status and real cause for the log.
const failures = new WeakMap<object, { status: number; cause: unknown }>();

export function recordFailure<E extends Error>(sent: E, status: number, cause: unknown): E {
  failures.set(sent, { status, cause });
  return sent;
}

export const failureOf = (err: unknown) => (typeof err === "object" && err !== null ? failures.get(err) : undefined);
