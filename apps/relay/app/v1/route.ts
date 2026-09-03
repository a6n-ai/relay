import { json } from "@foundry/routes";
import { handler } from "@foundry/routes";
import { publicApiCatalog } from "@/lib/v1/openapi";

export const GET = handler(async () => json(publicApiCatalog()));
