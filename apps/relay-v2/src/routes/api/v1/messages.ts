import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, readJson } from "../../../core/api-route";
import { sendMessage } from "../../../core/messages";
import { sendInputSchema } from "../../../core/send-input";

export const Route = createFileRoute("/api/v1/messages")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, scope, request }) => {
        const input = sendInputSchema.omit({ appId: true, campaignId: true }).parse(await readJson(request));
        return Response.json(await sendMessage(env, scope, input), { status: 202 });
      }),
    },
  },
});
