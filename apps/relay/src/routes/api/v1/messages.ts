import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, readJson } from "../../../api/route";
import { sendMessage } from "../../../services/messages";
import { sendBody } from "../../../core/send-input";

export const Route = createFileRoute("/api/v1/messages")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, p, request }) => {
        const input = sendBody.parse(await readJson(request));
        return Response.json(await sendMessage(env, p, input), { status: 202 });
      }),
    },
  },
});
