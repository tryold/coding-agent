import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runTurn } from "./server/agent";
import { inBackground } from "./server/callFor";
import { tools } from "./tools";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401), and serves the tools.
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request), {
  tools,
});

export default {
  ...app,
  // Each message is one turn of a session's agent loop.
  async queue(batch: MessageBatch<{ sessionId: string }>) {
    for (const message of batch.messages) {
      await inBackground(() => runTurn(message.body.sessionId));
      message.ack();
    }
  },
};
