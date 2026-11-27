import { createFileRoute } from "@tanstack/react-router";
import { consoleRoute } from "../../../console/route";
import { messageFile } from "../../../services/inbox";
import { RelayError } from "../../../shared/errors";

export const Route = createFileRoute("/api/console/messages/$id/$part")({
  server: {
    handlers: {
      GET: consoleRoute("download", {}, async ({ env, p, request, params }) => {
        if (params.id.length > 64 || params.part.length > 64) throw new RelayError("not found");
        const view = new URL(request.url).searchParams.get("view") === "1";
        return messageFile(env, p, params.id, params.part, view);
      }),
    },
  },
});
