import { WorkerEntrypoint } from "cloudflare:workers";
import type { Env } from "../env";

export class RelayRpc extends WorkerEntrypoint<Env> {}
