import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as repos from "@/server/repos";

export const Route = createFileRoute("/api/repos/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        respond(request, async (actor, body) => ({
          repo: await repos.updateRepo(actor, repos.updateRepoInput.parse({ ...(body as object), id: params.id })),
        })),
      DELETE: ({ request, params }) =>
        respond(request, async (actor) => {
          await repos.removeRepo(actor, params.id);
          return { ok: true };
        }),
    },
  },
});
