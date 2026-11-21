import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as sessions from "@/server/sessions";

export const Route = createFileRoute("/api/sessions/$id/messages")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        respond(request, (actor, body) =>
          sessions.sendMessage(actor, sessions.messageInput.parse({ ...(body as object), id: params.id })),
        ),
    },
  },
});
