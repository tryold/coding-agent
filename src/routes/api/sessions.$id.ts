import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as sessions from "@/server/sessions";

export const Route = createFileRoute("/api/sessions/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => respond(request, (actor) => sessions.getSession(actor, params.id)),
      PATCH: ({ request, params }) =>
        respond(request, (actor, body) =>
          sessions.setSharing(actor, sessions.sharingInput.parse({ ...(body as object), id: params.id })),
        ),
      DELETE: ({ request, params }) => respond(request, (actor) => sessions.deleteSession(actor, params.id)),
    },
  },
});
