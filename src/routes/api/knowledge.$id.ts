import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as knowledge from "@/server/knowledge";

export const Route = createFileRoute("/api/knowledge/$id")({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        respond(request, async (actor, body) => ({
          entry: await knowledge.updateKnowledge(actor, knowledge.updateKnowledgeInput.parse({ ...(body as object), id: params.id })),
        })),
      DELETE: ({ request, params }) =>
        respond(request, async (actor) => {
          await knowledge.deleteKnowledge(actor, params.id);
          return { ok: true };
        }),
    },
  },
});
