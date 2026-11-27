import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, readJson } from "../../../api/route";
import { sendTemplateMessage } from "../../../services/messages";
import { templateSendSchema } from "../../../shared/schemas";

export const Route = createFileRoute("/api/v1/templates/send")({
  server: {
    handlers: {
      POST: apiRoute(async ({ env, p, request }) =>
        data(await sendTemplateMessage(env, p, templateSendSchema.parse(await readJson(request))), 201),
      ),
    },
  },
});
