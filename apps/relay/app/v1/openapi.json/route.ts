import { json } from "@foundry/routes";
import { handler } from "@foundry/routes";
import { relayOpenApiDocument } from "@/lib/v1/openapi";

export const GET = handler(async () => json(relayOpenApiDocument()));
