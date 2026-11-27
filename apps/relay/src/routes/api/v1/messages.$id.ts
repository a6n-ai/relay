import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, json } from "../../../api/route";
import { getMessage } from "../../../services/messages";

export const Route = createFileRoute("/api/v1/messages/$id")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params }) => {
        const view = await getMessage(env, p, params.id);
        return view ? Response.json(view) : json({ error: "not found" }, 404);
      }),
    },
  },
});
