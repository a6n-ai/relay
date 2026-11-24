import { createFileRoute } from "@tanstack/react-router";
import { apiRoute } from "../../../core/api-route";
import { removeMemberForScope } from "../../../core/lists";

export const Route = createFileRoute("/api/v1/lists/$id/members/$memberId")({
  server: {
    handlers: {
      DELETE: apiRoute(async ({ env, scope, params }) => {
        await removeMemberForScope(env, scope, params.id, params.memberId);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
