// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in user; the same queries and rules as the pages.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { HttpError } from "@/server/access";
import { actorFor } from "@/server/actor";
import * as sessions from "@/server/sessions";

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) throw new ToolError(error.message);
    throw error;
  }
}

export const tools = defineTools(
  {
    list_sessions: {
      description: "List agent and ask sessions: the user's own (mine), shared ones (shared), or every one for admins (all).",
      risk: "read",
      input: sessions.listInput,
      handler: async (input, { user }) => guard(async () => sessions.listSessions(await actorFor(user), input)),
    },
    get_session: {
      description: "Read one session: its status, steps, pull request and the knowledge it used.",
      risk: "read",
      input: sessions.idInput,
      handler: async ({ id }, { user }) => guard(async () => sessions.getSession(await actorFor(user), id)),
    },
    send_message: {
      description: "Send a follow-up message to a session; it resumes the same sandbox.",
      risk: "write",
      idempotent: false,
      input: sessions.messageInput,
      handler: async (input, { user }) => guard(async () => sessions.sendMessage(await actorFor(user), input)),
    },
  },
  { instructions: "Call list_sessions first when a session id isn't known." },
);

