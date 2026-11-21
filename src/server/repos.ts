import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { repos } from "@/db/schema";
import { HttpError, requireAdmin, type Actor } from "./access";
import { findRepo } from "./github";

export const addRepoInput = z
  .object({
    fullName: z
      .string()
      .trim()
      .regex(/^[\w.-]+\/[\w.-]+$/, "Use the owner/name form."),
    defaultBranch: z.string().trim().max(200).optional(),
    setupCommand: z.string().trim().max(2000).optional(),
  })
  .strict();
export const updateRepoInput = z
  .object({ id: z.string(), setupCommand: z.string().trim().max(2000) })
  .strict();

const shown = {
  id: repos.id,
  fullName: repos.fullName,
  defaultBranch: repos.defaultBranch,
  setupCommand: repos.setupCommand,
};
export type Repo = { id: string; fullName: string; defaultBranch: string; setupCommand: string | null };

export function listRepos(): Promise<Repo[]> {
  return db.select(shown).from(repos).where(isNull(repos.removedAt)).orderBy(asc(repos.fullName));
}

export async function getRepo(id: string): Promise<Repo | null> {
  const [repo] = await db
    .select(shown)
    .from(repos)
    .where(and(eq(repos.id, id), isNull(repos.removedAt)));
  return repo ?? null;
}

export async function addRepo(actor: Actor, input: z.infer<typeof addRepoInput>): Promise<Repo> {
  requireAdmin(actor);
  const found = await findRepo(input.fullName);
  if (!found) throw new HttpError(422, `GitHub has no repository ${input.fullName} that the token can reach.`);
  const existing = (await listRepos()).find(
    (repo) => repo.fullName.toLowerCase() === found.fullName.toLowerCase(),
  );
  if (existing) throw new HttpError(409, `${found.fullName} is already added.`);
  const [repo] = await db
    .insert(repos)
    .values({
      id: crypto.randomUUID(),
      fullName: found.fullName,
      defaultBranch: input.defaultBranch || found.defaultBranch,
      setupCommand: input.setupCommand || null,
      addedBy: actor.id,
    })
    .returning(shown);
  return repo!;
}

export async function updateRepo(actor: Actor, input: z.infer<typeof updateRepoInput>): Promise<Repo> {
  requireAdmin(actor);
  const [repo] = await db
    .update(repos)
    .set({ setupCommand: input.setupCommand || null })
    .where(and(eq(repos.id, input.id), isNull(repos.removedAt)))
    .returning(shown);
  if (!repo) throw new HttpError(404, "No such repository.");
  return repo;
}

/** Removed from the list; past sessions keep the repository's name and history. */
export async function removeRepo(actor: Actor, id: string): Promise<void> {
  requireAdmin(actor);
  const [repo] = await db
    .update(repos)
    .set({ removedAt: sql`(current_timestamp)` })
    .where(and(eq(repos.id, id), isNull(repos.removedAt)))
    .returning({ id: repos.id });
  if (!repo) throw new HttpError(404, "No such repository.");
}
