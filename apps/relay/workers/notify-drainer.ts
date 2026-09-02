import postgres from "postgres";
import { createLogger } from "@foundry/commons/logger";
import { workerTick } from "../lib/notifications/drain";

const log = createLogger("relay-drainer");
const INTERVAL_MS = Number(process.env.NOTIFY_DRAIN_INTERVAL_MS ?? 15_000);

export async function drainLoop(opts: {
  intervalMs: number;
  signal?: AbortSignal;
  tick?: () => Promise<{ campaigns: number; drained: number; webhooks: number }>;
}): Promise<void> {
  const tick = opts.tick ?? (() => workerTick());
  while (!opts.signal?.aborted) {
    try {
      const n = await tick();
      if (n.campaigns + n.drained + n.webhooks > 0) log.info(n, "worker tick");
    } catch (err) {
      log.error({ err }, "drain failed");
    }
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}

async function listenAndPoll(signal: AbortSignal): Promise<void> {
  const url = process.env.DATABASE_URL;
  let listen: ReturnType<typeof postgres> | undefined;
  if (url) {
    listen = postgres(url, { max: 1, prepare: false, idle_timeout: 0 });
    await listen.listen("relay_work", async () => {
      try {
        const n = await workerTick();
        if (n.campaigns + n.drained + n.webhooks > 0) log.info(n, "notify tick");
      } catch (err) {
        log.error({ err }, "notify tick failed");
      }
    });
    log.info("listening on relay_work");
  }
  try {
    await drainLoop({ intervalMs: INTERVAL_MS, signal });
  } finally {
    await listen?.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("notify-drainer.ts")) {
  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());
  listenAndPoll(controller.signal).catch((err) => {
    log.error({ err }, "fatal");
    process.exit(1);
  });
}
