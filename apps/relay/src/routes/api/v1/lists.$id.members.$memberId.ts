import { createFileRoute } from "@tanstack/react-router";
import { apiRoute } from "../../../api/route";
import { removeMember } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists/$id/members/$memberId")({
  server: {
    handlers: {
      DELETE: apiRoute(async ({ env, p, params }) => {
        await removeMember(env, p, params.id, params.memberId);
        return new Response(null, { status: 204 });
      }),
    },
  },
});
