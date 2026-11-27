import { createFileRoute } from "@tanstack/react-router";
import { consoleRoute } from "../console/route";
import { exportMembers } from "../services/lists";
import { RelayError } from "../shared/errors";

export const Route = createFileRoute("/lists/$listId/export")({
  server: {
    handlers: {
      GET: consoleRoute("export", { permission: { list: ["import"] } }, async ({ env, p, params }) => {
        if (p.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
        if (params.listId.length > 64) throw new RelayError("not found");
        return exportMembers(env, p, params.listId);
      }),
    },
  },
});
