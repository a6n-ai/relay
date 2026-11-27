import { createFileRoute } from "@tanstack/react-router";
import { apiRoute } from "../../../core/api-route";
import { exportMembersForScope } from "../../../core/lists";

export const Route = createFileRoute("/api/v1/lists/$id/export")({
  server: {
    handlers: {
      GET: apiRoute(({ env, scope, params }) => exportMembersForScope(env, scope, params.id)),
    },
  },
});
