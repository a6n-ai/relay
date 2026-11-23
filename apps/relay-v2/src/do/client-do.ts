import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

export class ClientDO extends DurableObject<Env> {
  ping(): string {
    return "ok";
  }
}
