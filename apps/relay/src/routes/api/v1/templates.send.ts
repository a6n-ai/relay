import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, readJson } from "../../../core/api-route";
import { sendTemplateMessage } from "../../../core/messages";
import { templateSendSchema } from "../../../core/send-input";

export const Route = createFileRoute("/api/v1/templates/send")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, scope, request }) =>
        data(await sendTemplateMessage(env, scope, templateSendSchema.parse(await readJson(request))), 201),
      ),
    },
  },
});
