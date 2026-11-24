import { createFileRoute } from "@tanstack/react-router";
import { decodeCursor } from "../../../do/console-reads";
import { apiRoute, data, json, readJson } from "../../../core/api-route";
import { memberInput } from "../../../core/member-input";
import { addMemberForScope, listMembersForScope } from "../../../core/lists";

export const Route = createFileRoute("/api/v1/lists/$id/members")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, scope, params, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listMembersForScope(env, scope, params.id, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, scope, params, request }) => {
        const outcome = await addMemberForScope(env, scope, params.id, memberInput.parse(await readJson(request)));
        return data({ outcome }, outcome === "added" ? 201 : 200);
      }),
    },
  },
});
