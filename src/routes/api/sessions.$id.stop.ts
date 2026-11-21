import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as sessions from "@/server/sessions";

export const Route = createFileRoute("/api/sessions/$id/stop")({
  server: {
    handlers: {
      POST: ({ request, params }) => respond(request, (actor) => sessions.stopSession(actor, params.id)),
    },
  },
});
