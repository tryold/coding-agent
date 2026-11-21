import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { HttpError } from "@/server/access";
import { actorFor } from "@/server/actor";
import * as knowledge from "@/server/knowledge";
import * as repos from "@/server/repos";
import * as sessions from "@/server/sessions";
import { readiness } from "@/server/setup";

// Every server function runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in.
const member = createServerFn().middleware([ensureUserMiddleware]);
const memberPost = createServerFn({ method: "POST" }).middleware([ensureUserMiddleware]);

export const getMe = member.handler(async ({ context }) => {
  const actor = await actorFor(context.user);
  return { email: actor.email, admin: actor.admin };
});

export const getSessions = member
  .validator((data: unknown) => sessions.listInput.parse(data))
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context.user);
    return { sessions: await sessions.listSessions(actor, data), admin: actor.admin };
  });

/** The session, or null when it's missing or hidden from this member. */
export const getSession = member
  .validator((data: unknown) => sessions.idInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      return await sessions.getSession(await actorFor(context.user), data.id);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  });

export const getNewSession = member.handler(async () => {
  const [repoList, setup] = await Promise.all([repos.listRepos(), readiness()]);
  return { repos: repoList, setup };
});

export const startSession = memberPost
  .validator((data: unknown) => sessions.startInput.parse(data))
  .handler(async ({ data, context }) => sessions.startSession(await actorFor(context.user), data));

export const sendMessage = memberPost
  .validator((data: unknown) => sessions.messageInput.parse(data))
  .handler(async ({ data, context }) => sessions.sendMessage(await actorFor(context.user), data));

export const stopSession = memberPost
  .validator((data: unknown) => sessions.idInput.parse(data))
  .handler(async ({ data, context }) => sessions.stopSession(await actorFor(context.user), data.id));

export const deleteSession = memberPost
  .validator((data: unknown) => sessions.idInput.parse(data))
  .handler(async ({ data, context }) => sessions.deleteSession(await actorFor(context.user), data.id));

export const setSharing = memberPost
  .validator((data: unknown) => sessions.sharingInput.parse(data))
  .handler(async ({ data, context }) => sessions.setSharing(await actorFor(context.user), data));

export const refreshPull = memberPost
  .validator((data: unknown) => sessions.idInput.parse(data))
  .handler(async ({ data, context }) => sessions.refreshPull(await actorFor(context.user), data.id));

export const getRepos = member.handler(async ({ context }) => {
  const actor = await actorFor(context.user);
  return { repos: await repos.listRepos(), admin: actor.admin };
});

export const addRepo = memberPost
  .validator((data: unknown) => repos.addRepoInput.parse(data))
  .handler(async ({ data, context }) => repos.addRepo(await actorFor(context.user), data));

export const updateRepo = memberPost
  .validator((data: unknown) => repos.updateRepoInput.parse(data))
  .handler(async ({ data, context }) => repos.updateRepo(await actorFor(context.user), data));

export const removeRepo = memberPost
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => repos.removeRepo(await actorFor(context.user), data.id));

export const getKnowledge = member.handler(async ({ context }) => {
  const actor = await actorFor(context.user);
  const [entries, repoList] = await Promise.all([knowledge.listKnowledge(actor), repos.listRepos()]);
  return { entries, repos: repoList };
});

export const createKnowledge = memberPost
  .validator((data: unknown) => knowledge.createKnowledgeInput.parse(data))
  .handler(async ({ data, context }) => knowledge.createKnowledge(await actorFor(context.user), data));

export const updateKnowledge = memberPost
  .validator((data: unknown) => knowledge.updateKnowledgeInput.parse(data))
  .handler(async ({ data, context }) => knowledge.updateKnowledge(await actorFor(context.user), data));

export const deleteKnowledge = memberPost
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => knowledge.deleteKnowledge(await actorFor(context.user), data.id));
