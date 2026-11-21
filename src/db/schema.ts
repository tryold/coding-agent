import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

// The organization's members, keyed by the Gateway's user id.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

// Repositories the agent may work on. A removed one keeps its row
// (removed_at) so past sessions keep their history.
export const repos = sqliteTable(
  "repos",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    setupCommand: text("setup_command"),
    addedBy: text("added_by").notNull(),
    createdAt: createdAt(),
    removedAt: text("removed_at"),
  },
  (t) => [index("repos_full_name").on(t.fullName)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    mode: text("mode", { enum: ["agent", "ask"] }).notNull(),
    ownerId: text("owner_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    repoId: text("repo_id").notNull(),
    repoName: text("repo_name").notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    tier: text("tier", { enum: ["lite", "normal", "ultra"] }).notNull(),
    status: text("status", {
      enum: ["queued", "working", "waiting", "finished", "failed", "stopped"],
    }).notNull(),
    visibility: text("visibility", { enum: ["private", "org"] })
      .notNull()
      .default("private"),
    collaborate: integer("collaborate", { mode: "boolean" })
      .notNull()
      .default(false),
    // The ask thread an agent session was started from.
    threadId: text("thread_id"),
    sandboxId: text("sandbox_id"),
    baseSha: text("base_sha"),
    branch: text("branch"),
    error: text("error"),
    // The model conversation, as OpenAI-style messages (JSON).
    transcript: text("transcript").notNull().default("[]"),
    turns: integer("turns").notNull().default(0),
    createdAt: createdAt(),
    lastActivityAt: text("last_activity_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index("sessions_owner").on(t.ownerId),
    index("sessions_thread").on(t.threadId),
  ],
);

export const steps = sqliteTable(
  "steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    kind: text("kind", {
      enum: [
        "user",
        "message",
        "command",
        "file",
        "answer",
        "question",
        "error",
      ],
    }).notNull(),
    authorEmail: text("author_email"),
    text: text("text"),
    command: text("command"),
    exitCode: integer("exit_code"),
    output: text("output"),
    path: text("path"),
    additions: integer("additions"),
    deletions: integer("deletions"),
    files: text("files"),
    // A member's message the agent hasn't read yet.
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("steps_session").on(t.sessionId, t.id)],
);

export const pullRequests = sqliteTable("pull_requests", {
  sessionId: text("session_id").primaryKey(),
  number: integer("number").notNull(),
  url: text("url").notNull(),
  branch: text("branch").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  filesChanged: integer("files_changed").notNull(),
  additions: integer("additions").notNull(),
  deletions: integer("deletions").notNull(),
  commits: integer("commits").notNull().default(1),
  state: text("state", { enum: ["open", "merged", "closed"] }).notNull(),
  headSha: text("head_sha").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const knowledge = sqliteTable("knowledge", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  authorEmail: text("author_email").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  repoId: text("repo_id"),
  trigger: text("trigger_text").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Which knowledge entries a session was given.
export const sessionKnowledge = sqliteTable(
  "session_knowledge",
  {
    sessionId: text("session_id").notNull(),
    knowledgeId: text("knowledge_id").notNull(),
    title: text("title").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.knowledgeId] })],
);
