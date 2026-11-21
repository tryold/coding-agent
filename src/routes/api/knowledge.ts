import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as knowledge from "@/server/knowledge";

export const Route = createFileRoute("/api/knowledge")({
  server: {
    handlers: {
      GET: ({ request }) => respond(request, async (actor) => ({ entries: await knowledge.listKnowledge(actor) })),
      POST: ({ request }) =>
        respond(
          request,
          async (actor, body) => ({ entry: await knowledge.createKnowledge(actor, knowledge.createKnowledgeInput.parse(body)) }),
          201,
        ),
    },
  },
});
