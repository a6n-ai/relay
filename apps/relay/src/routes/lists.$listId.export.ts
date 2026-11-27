import { createFileRoute } from "@tanstack/react-router";
import { consoleRoute } from "../console/route";
import { exportMembers } from "../services/lists";
import { RelayError } from "../shared/errors";
import { ID_MAX } from "../shared/limits";

export const Route = createFileRoute("/lists/$listId/export")({
  server: {
    handlers: {
      GET: consoleRoute("export", { permission: { list: ["import"] }, refuseSuspended: true }, async ({ env, p, params }) => {
        if (params.listId.length > ID_MAX) throw new RelayError("not found");
        return exportMembers(env, p, params.listId);
      }),
    },
  },
});
