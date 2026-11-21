// One turn of a session's agent loop, run from the queue: read new
// messages, ask the model, carry out its tool calls, record each as a step,
// then queue the next turn or settle the session's status.
import { and, asc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { pullRequests, sessions, steps } from "@/db/schema";
import * as github from "./github";
import { knowledgeFor } from "./knowledge";
import { chat, type ChatMessage, type ToolCall, type ToolSpec } from "./model";
import { getRepo } from "./repos";
import { createSandbox, exec, quote, resumeSandbox, upload } from "./sandbox";

type Session = typeof sessions.$inferSelect;
type Step = typeof steps.$inferInsert;

const MAX_TURNS = 60;
const OUTPUT_LIMIT = 8000;

const clip = (text: string, limit = OUTPUT_LIMIT) =>
  text.length > limit ? `${text.slice(0, limit)}\n… (${text.length - limit} more characters)` : text;

const str = { type: "string" };
const tool = (name: string, description: string, properties: Record<string, unknown>): ToolSpec => ({
  name,
  description,
  parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});

const READ_TOOLS = [
  tool("list_files", "List files under a directory of the repository (relative path, '.' for the root).", { path: str }),
  tool("read_file", "Read a file of the repository.", { path: str }),
  tool("search", "Search the repository's files for a regular expression.", { query: str }),
];
const ASK_TOOLS = [
  ...READ_TOOLS,
  tool("answer", "Answer the question, or give the plan, and list the file paths you relied on.", {
    answer: str,
    files: { type: "array", items: str },
  }),
];
const AGENT_TOOLS = [
  ...READ_TOOLS,
  tool("write_file", "Write a file of the repository with its complete new contents.", { path: str, content: str }),
  tool("run_command", "Run a shell command in the repository, such as tests or a build.", { command: str }),
  tool("ask_user", "Ask the person a question and wait for their reply.", { question: str }),
  tool("finish", "The work is done: commit it and open or update the pull request.", { title: str, summary: str }),
];

async function systemPrompt(session: Session, setupCommand: string | null): Promise<string> {
  const entries = await knowledgeFor(session.repoId);
  const knowledge = entries.length
    ? `\n\nKnowledge from the team. Use an entry when its trigger applies:\n${entries
        .map((e) => `## ${e.title}\nApplies: ${e.trigger}\n${e.body}`)
        .join("\n\n")}`
    : "";
  const mode =
    session.mode === "ask"
      ? "You answer questions and write plans about the repository. You may only read and search files: never change anything. Finish every reply with the answer tool, citing the file paths you used."
      : "You are a software engineer. Plan, edit files, run commands and tests, and read their output until the task is done, then call finish. Call ask_user only when you can't go on without the person. Never push or switch branches yourself: finish commits for you.";
  return `${mode}\n\nRepository: ${session.repoName}, checked out at the working directory.${
    setupCommand ? ` Setup that already ran: ${setupCommand}` : ""
  }${knowledge}`;
}

async function record(sessionId: string, step: Omit<Step, "sessionId">) {
  await db.batch([
    db.insert(steps).values({ ...step, sessionId }),
    db.update(sessions).set({ lastActivityAt: sql`(current_timestamp)` }).where(eq(sessions.id, sessionId)),
  ]);
}

async function prepareSandbox(session: Session): Promise<string> {
  const repo = await getRepo(session.repoId);
  if (!repo) throw new Error("The repository was removed.");
  const sandboxId = await createSandbox(session.id);
  const base = await github.branchHead(repo.fullName, repo.defaultBranch);
  await upload(sandboxId, "/home/daytona/source.tar.gz", await github.tarball(repo.fullName, base));
  const checkout = await exec(
    sandboxId,
    `tar xzf /home/daytona/source.tar.gz --strip-components=1 && rm /home/daytona/source.tar.gz && git init -q && git add -A && git -c user.email=agent@localhost -c user.name=agent commit -qm base && git tag agent-base`,
  );
  if (checkout.exitCode !== 0) throw new Error(`Checking out the repository failed: ${clip(checkout.output, 500)}`);
  await db
    .update(sessions)
    .set({ sandboxId, baseSha: base })
    .where(eq(sessions.id, session.id));
  await record(session.id, { kind: "message", text: `Checked out ${repo.fullName} at ${repo.defaultBranch} in a new sandbox.` });
  if (repo.setupCommand) {
    const ran = await exec(sandboxId, repo.setupCommand, 900);
    await record(session.id, { kind: "command", command: repo.setupCommand, exitCode: ran.exitCode, output: clip(ran.output) });
  }
  return sandboxId;
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

const safePath = (value: unknown) => {
  const path = String(value ?? ".").replace(/^\/+/, "");
  if (path.split("/").includes("..")) throw new Error("Paths stay inside the repository.");
  return path || ".";
};

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type Outcome = { result: string; settle?: "finished" | "waiting" };

async function runTool(session: Session, sandboxId: string, call: ToolCall): Promise<Outcome> {
  const args = parseArgs(call);
  const name = call.function.name;
  const agent = session.mode === "agent";
  if (name === "list_files") {
    const ran = await exec(sandboxId, `git ls-files --others --cached --exclude-standard -- ${quote(safePath(args.path))} | head -500`);
    return { result: clip(ran.output) };
  }
  if (name === "read_file") {
    const ran = await exec(sandboxId, `cat -- ${quote(safePath(args.path))}`);
    return { result: ran.exitCode === 0 ? clip(ran.output, 20000) : `Couldn't read it: ${clip(ran.output, 300)}` };
  }
  if (name === "search") {
    const ran = await exec(sandboxId, `grep -rnI --exclude-dir=.git -E -e ${quote(String(args.query ?? ""))} . | head -200`);
    return { result: clip(ran.output) || "No matches." };
  }
  if (name === "answer" && !agent) {
    const files = Array.isArray(args.files) ? args.files.map(String).slice(0, 50) : [];
    await record(session.id, { kind: "answer", text: String(args.answer ?? ""), files: JSON.stringify(files) });
    return { result: "Answer shown to the person.", settle: "finished" };
  }
  if (name === "write_file" && agent) {
    const path = safePath(args.path);
    const content = toBase64(String(args.content ?? ""));
    const written = await exec(
      sandboxId,
      `mkdir -p "$(dirname -- ${quote(path)})" && printf %s ${quote(content)} | base64 -d > ${quote(path)} && git add -N -- ${quote(path)} && git diff --numstat -- ${quote(path)}`,
    );
    if (written.exitCode !== 0) return { result: `Writing failed: ${clip(written.output, 500)}` };
    const [added, removed] = written.output.trim().split(/\s+/);
    await record(session.id, {
      kind: "file",
      path,
      additions: Number(added) || 0,
      deletions: Number(removed) || 0,
    });
    return { result: `Wrote ${path}.` };
  }
  if (name === "run_command" && agent) {
    const command = String(args.command ?? "");
    const ran = await exec(sandboxId, command);
    await record(session.id, { kind: "command", command, exitCode: ran.exitCode, output: clip(ran.output) });
    return { result: `Exit code ${ran.exitCode}\n${clip(ran.output)}` };
  }
  if (name === "ask_user" && agent) {
    await record(session.id, { kind: "question", text: String(args.question ?? "") });
    return { result: "Asked; the reply comes as the next message.", settle: "waiting" };
  }
  if (name === "finish" && agent) {
    const message = await publish(session, sandboxId, String(args.title ?? session.title), String(args.summary ?? ""));
    return { result: message, settle: "finished" };
  }
  return { result: `There is no tool ${name} here.` };
}

/** Commits the working copy's changes to the session's branch and opens or updates its pull request. */
async function publish(session: Session, sandboxId: string, title: string, summary: string): Promise<string> {
  const repo = await getRepo(session.repoId);
  if (!repo) throw new Error("The repository was removed.");
  const changed = await exec(sandboxId, "git add -A && git diff --cached --name-status");
  const changes: github.FileChange[] = [];
  for (const line of changed.output.split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    const path = paths[paths.length - 1]!;
    if (status?.startsWith("R")) changes.push({ path: paths[0]!, content: null });
    if (status === "D") {
      changes.push({ path, content: null });
      continue;
    }
    const read = await exec(sandboxId, `base64 -w0 -- ${quote(path)}`);
    changes.push({ path, content: read.output.trim() });
  }
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.sessionId, session.id));
  if (!changes.length) {
    await record(session.id, { kind: "message", text: summary || "Done. Nothing to commit." });
    return "Nothing to commit.";
  }
  const branch = pr?.branch ?? session.branch ?? `agent/${session.id.slice(0, 8)}`;
  if (branch === repo.defaultBranch) throw new Error("The agent never pushes to the default branch.");
  const parent = pr?.headSha ?? session.baseSha!;
  const sha = await github.commit(session.repoName, parent, title, changes);
  await exec(sandboxId, `git -c user.email=agent@localhost -c user.name=agent commit -qm ${quote(title)}`);
  const totals = await exec(sandboxId, "git diff --numstat agent-base HEAD");
  let additions = 0;
  let deletions = 0;
  let files = 0;
  for (const line of totals.output.split("\n").filter(Boolean)) {
    const [a, d] = line.split("\t");
    additions += Number(a) || 0;
    deletions += Number(d) || 0;
    files++;
  }
  if (pr) {
    await github.moveBranch(session.repoName, branch, sha);
    await db
      .update(pullRequests)
      .set({ headSha: sha, additions, deletions, filesChanged: files, commits: pr.commits + 1, updatedAt: sql`(current_timestamp)` })
      .where(eq(pullRequests.sessionId, session.id));
    await record(session.id, { kind: "message", text: summary || `Pushed to ${branch}.` });
    return `Pushed a commit to ${branch}; pull request #${pr.number} is updated.`;
  }
  await github.createBranch(session.repoName, branch, sha);
  const opened = await github.openPull(session.repoName, { title, body: summary, head: branch, base: repo.defaultBranch });
  await db.batch([
    db.insert(pullRequests).values({
      sessionId: session.id,
      number: opened.number,
      url: opened.url,
      branch,
      title,
      summary,
      filesChanged: files,
      additions,
      deletions,
      state: opened.state,
      headSha: sha,
    }),
    db.update(sessions).set({ branch }).where(eq(sessions.id, session.id)),
  ]);
  await record(session.id, { kind: "message", text: summary || `Opened pull request #${opened.number}.` });
  return `Opened pull request #${opened.number} from ${branch}.`;
}

/** Runs one turn. Only the turn that moved the session from queued to working runs. */
export async function runTurn(sessionId: string): Promise<void> {
  const [session] = await db
    .update(sessions)
    .set({ status: "working", lastActivityAt: sql`(current_timestamp)` })
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, "queued")))
    .returning();
  if (!session) return;
  let transcript = JSON.parse(session.transcript) as ChatMessage[];
  try {
    const repo = await getRepo(session.repoId);
    let sandboxId = session.sandboxId;
    if (!sandboxId) sandboxId = await prepareSandbox(session);
    else await resumeSandbox(sandboxId);
    const fresh = { ...session, sandboxId, ...(await db.select({ baseSha: sessions.baseSha, branch: sessions.branch }).from(sessions).where(eq(sessions.id, sessionId)))[0] };

    // New messages from people join the conversation.
    const unread = await db
      .select()
      .from(steps)
      .where(and(eq(steps.sessionId, sessionId), eq(steps.kind, "user"), transcript.length ? eq(steps.pending, true) : sql`1`))
      .orderBy(asc(steps.id));
    for (const message of unread) {
      const from = message.authorEmail && message.authorEmail !== session.ownerEmail ? `(from ${message.authorEmail}) ` : "";
      transcript.push({ role: "user", content: `${from}${message.text ?? ""}` });
    }
    if (unread.length) {
      await db.update(steps).set({ pending: false }).where(and(eq(steps.sessionId, sessionId), eq(steps.pending, true)));
    }

    const system = await systemPrompt(fresh, repo?.setupCommand ?? null);
    const reply = await chat(session.tier, [{ role: "system", content: system }, ...transcript], session.mode === "ask" ? ASK_TOOLS : AGENT_TOOLS);
    transcript.push({ role: "assistant", content: reply.content, ...(reply.toolCalls.length ? { tool_calls: reply.toolCalls } : {}) });
    if (reply.content?.trim()) await record(sessionId, { kind: "message", text: reply.content.trim() });

    let settle: Outcome["settle"];
    for (const call of reply.toolCalls) {
      const [now] = await db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId));
      if (now?.status !== "working") {
        transcript.push({ role: "tool", tool_call_id: call.id, content: "Stopped by the person." });
        continue;
      }
      const outcome = await runTool(fresh, sandboxId, call);
      transcript.push({ role: "tool", tool_call_id: call.id, content: outcome.result });
      settle = outcome.settle ?? settle;
    }
    if (!reply.toolCalls.length && session.mode === "ask" && reply.content) {
      await record(sessionId, { kind: "answer", text: reply.content, files: "[]" });
      settle = "finished";
    }

    const [{ waiting }] = (await db
      .select({ waiting: sql<number>`count(*)` })
      .from(steps)
      .where(and(eq(steps.sessionId, sessionId), eq(steps.pending, true)))) as [{ waiting: number }];
    const turns = session.turns + 1;
    let next: "queued" | "finished" | "waiting" | "failed" = waiting > 0 || !settle ? "queued" : settle;
    let error: string | null = null;
    if (next === "queued" && turns >= MAX_TURNS) {
      next = "failed";
      error = `Stopped after ${MAX_TURNS} turns.`;
    }
    const [moved] = await db
      .update(sessions)
      .set({ status: next, error, turns, transcript: JSON.stringify(transcript), lastActivityAt: sql`(current_timestamp)` })
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, "working")))
      .returning({ id: sessions.id });
    if (!moved) {
      await db.update(sessions).set({ transcript: JSON.stringify(transcript), turns }).where(eq(sessions.id, sessionId));
    } else if (next === "queued") {
      await env.AGENT_RUNS.send({ sessionId });
    }
    if (error) await record(sessionId, { kind: "error", text: error });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Something went wrong.";
    await db
      .update(sessions)
      .set({ status: "failed", error: message, transcript: JSON.stringify(transcript), lastActivityAt: sql`(current_timestamp)` })
      .where(and(eq(sessions.id, sessionId), eq(sessions.status, "working")));
    await record(sessionId, { kind: "error", text: message });
  }
}
