import { createFileRoute } from "@tanstack/react-router";
import { apiRoute } from "../../../api/route";
import { exportMembersForScope } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists/$id/export")({
  server: {
    handlers: {
      GET: apiRoute(({ env, scope, params }) => exportMembersForScope(env, scope, params.id)),
    },
  },
});
