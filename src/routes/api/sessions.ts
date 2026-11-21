import { createFileRoute } from "@tanstack/react-router";
import { respond, queryOf } from "@/server/http";
import * as sessions from "@/server/sessions";

export const Route = createFileRoute("/api/sessions")({
  server: {
    handlers: {
      GET: ({ request }) =>
        respond(request, async (actor) => ({
          sessions: await sessions.listSessions(actor, sessions.listInput.parse(queryOf(request))),
        })),
      POST: ({ request }) =>
        respond(request, async (actor, body) => ({ session: await sessions.startSession(actor, sessions.startInput.parse(body)) }), 201),
    },
  },
});
