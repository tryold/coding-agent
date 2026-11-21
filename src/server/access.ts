// Who may do what. Pure functions over the rows, shared by the pages, the
// JSON routes and the tests.

export interface Actor {
  id: string;
  email: string;
  admin: boolean;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface SessionAccess {
  ownerId: string;
  visibility: "private" | "org";
  collaborate: boolean;
}

export function canRead(session: SessionAccess, actor: Actor): boolean {
  return (
    actor.admin ||
    session.ownerId === actor.id ||
    session.visibility === "org"
  );
}

/** Follow-up messages: the owner, or anyone once a shared session allows collaboration. */
export function canMessage(session: SessionAccess, actor: Actor): boolean {
  return (
    session.ownerId === actor.id ||
    (session.visibility === "org" && session.collaborate)
  );
}

/** Stop, delete and sharing: the owner or an admin. */
export function canManage(session: SessionAccess, actor: Actor): boolean {
  return actor.admin || session.ownerId === actor.id;
}

export function canEditKnowledge(
  entry: { authorId: string },
  actor: Actor,
): boolean {
  return actor.admin || entry.authorId === actor.id;
}

/** A knowledge entry applies to every repo, or to the one it's scoped to. */
export function knowledgeApplies(
  entry: { enabled: boolean; repoId: string | null },
  repoId: string,
): boolean {
  return entry.enabled && (entry.repoId === null || entry.repoId === repoId);
}

export function requireAdmin(actor: Actor): void {
  if (!actor.admin) throw new HttpError(403, "Only admins can do that.");
}

export const ACTIVE_STATUSES = ["queued", "working"] as const;
