import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { knowledge, repos } from "@/db/schema";
import { canEditKnowledge, HttpError, knowledgeApplies, type Actor } from "./access";

const fields = {
  title: z.string().trim().min(1, "Give it a title.").max(200),
  body: z.string().trim().min(1, "Write what the agent should know.").max(20000),
  trigger: z.string().trim().min(1, "Say when it applies.").max(500),
  repoId: z.string().nullable().optional(),
};
export const createKnowledgeInput = z.object(fields).strict();
export const updateKnowledgeInput = z
  .object({
    id: z.string(),
    title: fields.title.optional(),
    body: fields.body.optional(),
    trigger: fields.trigger.optional(),
    repoId: fields.repoId,
    enabled: z.boolean().optional(),
  })
  .strict();

export interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  trigger: string;
  repoId: string | null;
  repoName: string | null;
  enabled: boolean;
  authorEmail: string;
  canEdit: boolean;
}

const shown = {
  id: knowledge.id,
  title: knowledge.title,
  body: knowledge.body,
  trigger: knowledge.trigger,
  repoId: knowledge.repoId,
  repoName: repos.fullName,
  enabled: knowledge.enabled,
  authorId: knowledge.authorId,
  authorEmail: knowledge.authorEmail,
};

async function rows() {
  return db
    .select(shown)
    .from(knowledge)
    .leftJoin(repos, eq(repos.id, knowledge.repoId))
    .orderBy(desc(knowledge.updatedAt), knowledge.id);
}

export async function listKnowledge(actor: Actor): Promise<KnowledgeEntry[]> {
  return (await rows()).map(({ authorId, ...entry }) => ({
    ...entry,
    canEdit: canEditKnowledge({ authorId }, actor),
  }));
}

/** The entries an agent gets for a repository. */
export async function knowledgeFor(repoId: string) {
  return (await rows()).filter((entry) => knowledgeApplies(entry, repoId));
}

async function own(actor: Actor, id: string) {
  const [entry] = await db.select().from(knowledge).where(eq(knowledge.id, id));
  if (!entry) throw new HttpError(404, "No such entry.");
  if (!canEditKnowledge(entry, actor)) {
    throw new HttpError(403, "Only its author or an admin can change this entry.");
  }
}

export async function createKnowledge(actor: Actor, input: z.infer<typeof createKnowledgeInput>) {
  const id = crypto.randomUUID();
  await db.insert(knowledge).values({
    id,
    authorId: actor.id,
    authorEmail: actor.email,
    title: input.title,
    body: input.body,
    trigger: input.trigger,
    repoId: input.repoId || null,
  });
  return (await listKnowledge(actor)).find((entry) => entry.id === id)!;
}

export async function updateKnowledge(actor: Actor, { id, ...change }: z.infer<typeof updateKnowledgeInput>) {
  await own(actor, id);
  await db
    .update(knowledge)
    .set({
      ...change,
      ...(change.repoId !== undefined ? { repoId: change.repoId || null } : {}),
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(knowledge.id, id));
  return (await listKnowledge(actor)).find((entry) => entry.id === id)!;
}

export async function deleteKnowledge(actor: Actor, id: string) {
  await own(actor, id);
  await db.delete(knowledge).where(eq(knowledge.id, id));
}
