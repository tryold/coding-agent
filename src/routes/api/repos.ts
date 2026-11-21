import { createFileRoute } from "@tanstack/react-router";
import { respond } from "@/server/http";
import * as repos from "@/server/repos";

export const Route = createFileRoute("/api/repos")({
  server: {
    handlers: {
      GET: ({ request }) => respond(request, async () => ({ repos: await repos.listRepos() })),
      POST: ({ request }) =>
        respond(request, async (actor, body) => ({ repo: await repos.addRepo(actor, repos.addRepoInput.parse(body)) }), 201),
    },
  },
});
