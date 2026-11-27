import { createFileRoute } from "@tanstack/react-router";
import { decodeCursor } from "../../../core/cursor";
import { apiRoute, data, json, readJson } from "../../../api/route";
import { memberInput } from "../../../shared/schemas";
import { addMember, listMembers } from "../../../services/lists";

export const Route = createFileRoute("/api/v1/lists/$id/members")({
  server: {
    handlers: {
      GET: apiRoute(async ({ env, p, params, request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor !== undefined && !decodeCursor(cursor)) return json({ error: "invalid input" }, 400);
        const page = await listMembers(env, p, params.id, cursor);
        return json({ data: page.rows, nextCursor: page.nextCursor });
      }),
      POST: apiRoute(async ({ env, p, params, request }) => {
        const outcome = await addMember(env, p, params.id, memberInput.parse(await readJson(request)));
        return data({ outcome }, outcome === "added" ? 201 : 200);
      }),
    },
  },
});
