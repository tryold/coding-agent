import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { pullRequests, sessionKnowledge, sessions, steps } from "@/db/schema";
import { canManage, canMessage, canRead, HttpError, type Actor } from "./access";
import { readPull } from "./github";
import { knowledgeFor } from "./knowledge";
import { TIERS, type Tier } from "./model";
import { getRepo } from "./repos";
import { deleteSandbox } from "./sandbox";
import { readiness } from "./setup";

export const STATUSES = ["queued", "working", "waiting", "finished", "failed", "stopped"] as const;
export type Status = (typeof STATUSES)[number];

export const listInput = z
  .object({
    view: z.enum(["mine", "shared", "all"]).default("mine"),
    status: z.enum(STATUSES).optional(),
  })
  .strict();
export const startInput = z
  .object({
    mode: z.enum(["agent", "ask"]),
    repoId: z.string().min(1, "Pick a repository."),
    tier: z.enum(["lite", "normal", "ultra"]).default("normal"),
    prompt: z.string().trim().min(1, "Say what to do.").max(20000),
    threadId: z.string().optional(),
  })
  .strict();
export const messageInput = z.object({ id: z.string(), text: z.string().trim().min(1).max(20000) }).strict();
export const sharingInput = z
  .object({
    id: z.string(),
    visibility: z.enum(["private", "org"]).optional(),
    collaborate: z.boolean().optional(),
  })
  .strict();
export const idInput = z.object({ id: z.string() }).strict();

const listed = {
  id: sessions.id,
  mode: sessions.mode,
  title: sessions.title,
  repoName: sessions.repoName,
  status: sessions.status,
  tier: sessions.tier,
  ownerId: sessions.ownerId,
  ownerEmail: sessions.ownerEmail,
  visibility: sessions.visibility,
  collaborate: sessions.collaborate,
  lastActivityAt: sessions.lastActivityAt,
};

export async function listSessions(actor: Actor, input: z.infer<typeof listInput>) {
  const where: SQL[] = [];
  if (input.view === "mine") where.push(eq(sessions.ownerId, actor.id));
  else if (input.view === "shared") where.push(eq(sessions.visibility, "org"), ne(sessions.ownerId, actor.id));
  else if (!actor.admin) throw new HttpError(403, "Only admins see every session.");
  if (input.status) where.push(eq(sessions.status, input.status));
  const rows = await db
    .select({ ...listed, pr: { number: pullRequests.number, state: pullRequests.state, url: pullRequests.url } })
    .from(sessions)
    .leftJoin(pullRequests, eq(pullRequests.sessionId, sessions.id))
    .where(and(...where))
    .orderBy(desc(sessions.lastActivityAt), desc(sessions.createdAt))
    .limit(200);
  return rows.map(({ pr, ...row }) => ({ ...row, pullRequest: pr?.number ? pr : null }));
}

async function load(id: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  return session ?? null;
}

/** The session, if the actor may see it; a hidden one is the same as a missing one. */
async function readable(actor: Actor, id: string) {
  const session = await load(id);
  if (!session || !canRead(session, actor)) throw new HttpError(404, "No such session.");
  return session;
}

export async function getSession(actor: Actor, id: string) {
  const session = await readable(actor, id);
  const [stepRows, [pr], used, linked, thread] = await Promise.all([
    db.select().from(steps).where(eq(steps.sessionId, id)).orderBy(asc(steps.id)),
    db.select().from(pullRequests).where(eq(pullRequests.sessionId, id)),
    db.select({ id: sessionKnowledge.knowledgeId, title: sessionKnowledge.title }).from(sessionKnowledge).where(eq(sessionKnowledge.sessionId, id)),
    db.select(listed).from(sessions).where(eq(sessions.threadId, id)).orderBy(asc(sessions.createdAt)),
    session.threadId ? load(session.threadId) : null,
  ]);
  const { transcript: _transcript, sandboxId: _sandbox, ...shown } = session;
  return {
    session: { ...shown, tierLabel: TIERS[session.tier].label },
    steps: stepRows.map(({ files, pending: _pending, ...step }) => ({
      ...step,
      files: files ? (JSON.parse(files) as string[]) : [],
    })),
    pullRequest: pr ?? null,
    knowledge: used,
    linked: linked.filter((other) => canRead(other, actor)),
    thread: thread && canRead(thread, actor) ? { id: thread.id, title: thread.title } : null,
    can: {
      message: canMessage(session, actor),
      manage: canManage(session, actor),
      own: session.ownerId === actor.id,
    },
  };
}

function titleOf(prompt: string): string {
  const line = prompt.split("\n").find((l) => l.trim()) ?? prompt;
  return line.trim().length > 80 ? `${line.trim().slice(0, 77)}…` : line.trim();
}

async function enqueue(sessionId: string) {
  await env.AGENT_RUNS.send({ sessionId });
}

export async function startSession(actor: Actor, input: z.infer<typeof startInput>) {
  const setup = await readiness();
  if (!setup.ready) throw new HttpError(503, `Set up ${setup.missing.join(", ")} on the Gateway first.`);
  const repo = await getRepo(input.repoId);
  if (!repo) throw new HttpError(422, "Pick a repository from the list.");
  if (input.threadId) {
    const thread = await readable(actor, input.threadId);
    if (thread.mode !== "ask") throw new HttpError(422, "Only an ask thread can hand off a session.");
  }
  const id = crypto.randomUUID();
  const entries = await knowledgeFor(repo.id);
  await db.batch([
    db.insert(sessions).values({
      id,
      mode: input.mode,
      ownerId: actor.id,
      ownerEmail: actor.email,
      repoId: repo.id,
      repoName: repo.fullName,
      title: titleOf(input.prompt),
      prompt: input.prompt,
      tier: input.tier as Tier,
      status: "queued",
      threadId: input.threadId ?? null,
    }),
    db.insert(steps).values({ sessionId: id, kind: "user", authorEmail: actor.email, text: input.prompt }),
    ...entries.map((entry) =>
      db.insert(sessionKnowledge).values({ sessionId: id, knowledgeId: entry.id, title: entry.title }),
    ),
  ]);
  await enqueue(id);
  return { id, status: "queued" as Status };
}

const RESUMABLE: Status[] = ["waiting", "finished", "failed", "stopped"];

export async function sendMessage(actor: Actor, input: z.infer<typeof messageInput>) {
  const session = await readable(actor, input.id);
  if (!canMessage(session, actor)) throw new HttpError(403, "The owner hasn't opened this session to messages.");
  await db.insert(steps).values({
    sessionId: session.id,
    kind: "user",
    authorEmail: actor.email,
    text: input.text,
    pending: true,
  });
  const [resumed] = await db
    .update(sessions)
    .set({ status: "queued", error: null, lastActivityAt: sql`(current_timestamp)` })
    .where(and(eq(sessions.id, session.id), inArray(sessions.status, RESUMABLE)))
    .returning({ id: sessions.id });
  if (resumed) await enqueue(session.id);
  return { ok: true };
}

export async function stopSession(actor: Actor, id: string) {
  const session = await readable(actor, id);
  if (!canManage(session, actor)) throw new HttpError(403, "Only the owner or an admin can stop this session.");
  const [stopped] = await db
    .update(sessions)
    .set({ status: "stopped", lastActivityAt: sql`(current_timestamp)` })
    .where(and(eq(sessions.id, id), inArray(sessions.status, ["queued", "working", "waiting"])))
    .returning({ id: sessions.id });
  if (!stopped) throw new HttpError(409, "This session isn't running.");
  return { ok: true };
}

export async function setSharing(actor: Actor, { id, ...change }: z.infer<typeof sharingInput>) {
  const session = await readable(actor, id);
  if (!canManage(session, actor)) throw new HttpError(403, "Only the owner or an admin can change sharing.");
  const visibility = change.visibility ?? session.visibility;
  await db
    .update(sessions)
    .set({
      visibility,
      // A private session has no collaborators.
      collaborate: visibility === "private" ? false : (change.collaborate ?? session.collaborate),
    })
    .where(eq(sessions.id, id));
  return { ok: true };
}

export async function deleteSession(actor: Actor, id: string) {
  const session = await readable(actor, id);
  if (!canManage(session, actor)) throw new HttpError(403, "Only the owner or an admin can delete this session.");
  await db.batch([
    db.delete(steps).where(eq(steps.sessionId, id)),
    db.delete(pullRequests).where(eq(pullRequests.sessionId, id)),
    db.delete(sessionKnowledge).where(eq(sessionKnowledge.sessionId, id)),
    db.update(sessions).set({ threadId: null }).where(eq(sessions.threadId, id)),
    db.delete(sessions).where(eq(sessions.id, id)),
  ]);
  if (session.sandboxId) await deleteSandbox(session.sandboxId);
  return { ok: true };
}

export async function refreshPull(actor: Actor, id: string) {
  const session = await readable(actor, id);
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.sessionId, id));
  if (!pr) throw new HttpError(404, "This session has no pull request.");
  const fresh = await readPull(session.repoName, pr.number);
  await db
    .update(pullRequests)
    .set({ state: fresh.state, updatedAt: sql`(current_timestamp)` })
    .where(eq(pullRequests.sessionId, id));
  return { state: fresh.state };
}
