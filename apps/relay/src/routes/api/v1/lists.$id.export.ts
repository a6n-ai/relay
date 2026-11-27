import { createFileRoute } from "@tanstack/react-router";
import { apiRoute } from "../../../api/route";
import { exportMembers } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists/$id/export")({
  server: {
    handlers: {
      GET: apiRoute(({ env, p, params }) => exportMembers(env, p, params.id)),
    },
  },
});
