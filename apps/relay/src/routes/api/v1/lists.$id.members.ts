import { createFileRoute } from "@tanstack/react-router";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { memberInput } from "../../../shared/schemas";
import { addMember, listMembers } from "../../../services/lists";
import { cursorParam } from "../../../services/schemas";

export const Route = createFileRoute("/api/v1/lists/$id/members")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params, request }) => {
        const page = await listMembers(env, p, params.id, cursorParam(request));
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, p, params, request }) => {
        const outcome = await addMember(env, p, params.id, memberInput.parse(await readJson(request)));
        return data({ outcome }, outcome === "added" ? 201 : 200);
      }),
    },
  },
});
