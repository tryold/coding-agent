// Who may read and change what, with the default Gateway stand-in (no model,
// sandbox or GitHub configured).
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";

const runtime = await startRuntime();
const send = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

try {
  const db = await runtime.database();
  const now = "2026-11-20 10:00:00";
  const seed = [
    ["INSERT INTO repos (id, full_name, default_branch, setup_command, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["r1", "acme/storefront", "main", "npm ci", "owner", now]],
    ["INSERT INTO sessions (id, mode, owner_id, owner_email, repo_id, repo_name, title, prompt, tier, status, visibility, collaborate, created_at, last_activity_at) VALUES (?, 'agent', 'owner', 'owner@example.test', 'r1', 'acme/storefront', ?, ?, 'normal', 'working', 'private', 0, ?, ?)", ["s-owner-private", "Rotate payment keys", "secret-plan-owner", now, now]],
    ["INSERT INTO sessions (id, mode, owner_id, owner_email, repo_id, repo_name, title, prompt, tier, status, visibility, collaborate, created_at, last_activity_at) VALUES (?, 'agent', 'owner', 'owner@example.test', 'r1', 'acme/storefront', ?, ?, 'normal', 'working', 'org', 0, ?, ?)", ["s-owner-shared", "Fix checkout rounding", "shared-plan", now, now]],
    ["INSERT INTO sessions (id, mode, owner_id, owner_email, repo_id, repo_name, title, prompt, tier, status, visibility, collaborate, created_at, last_activity_at) VALUES (?, 'ask', 'member', 'member@example.test', 'r1', 'acme/storefront', ?, ?, 'normal', 'finished', 'private', 0, ?, ?)", ["s-member-private", "Where is tax computed?", "secret-plan-member", now, now]],
    ["INSERT INTO knowledge (id, author_id, author_email, title, body, repo_id, trigger_text, enabled, created_at, updated_at) VALUES (?, 'owner', 'owner@example.test', 'Deploy rules', 'Never deploy on Fridays.', NULL, 'When deploying', 1, ?, ?)", ["k-owner", now, now]],
  ];
  for (const [sql, args] of seed) await db.prepare(sql).bind(...args).run();

  // Anonymous and outsider are refused everywhere; members open the app.
  await runtime.assertPrivateAccess(["/", "/repos", "/knowledge", "/new", "/sessions/s-owner-shared", "/api/sessions", "/api/repos", "/api/knowledge", "/api/sessions/s-owner-shared"]);
  for (const role of [undefined, "outsider"]) {
    expect((await runtime.fetch("/api/sessions/s-owner-private", { role })).status).not.toBe(200);
    expect([401, 403]).toContain((await runtime.fetch("/api/repos", { role, ...send("POST", { fullName: "acme/x" }) })).status);
  }

  // A member can't read or change another member's private session.
  const hidden = await runtime.fetch("/api/sessions/s-owner-private", { role: "member" });
  expect(hidden.status).toBe(404);
  expect(await hidden.text()).not.toContain("secret-plan-owner");
  const hiddenPage = await runtime.fetch("/sessions/s-owner-private", { role: "member" });
  expect(await hiddenPage.text()).not.toContain("secret-plan-owner");
  expect((await runtime.fetch("/api/sessions/s-owner-private/messages", { role: "member", ...send("POST", { text: "hi" }) })).status).toBe(404);
  const list = await (await runtime.fetch("/api/sessions?view=shared", { role: "member" })).json();
  expect(list.sessions.map((s) => s.id)).toEqual(["s-owner-shared"]);
  expect((await runtime.fetch("/api/sessions?view=all", { role: "member" })).status).toBe(403);

  // Shared without collaboration: read-only for members.
  expect((await runtime.fetch("/api/sessions/s-owner-shared", { role: "member" })).status).toBe(200);
  expect((await runtime.fetch("/api/sessions/s-owner-shared/messages", { role: "member", ...send("POST", { text: "hi" }) })).status).toBe(403);
  expect((await runtime.fetch("/api/sessions/s-owner-shared/stop", { role: "member", method: "POST" })).status).toBe(403);
  expect((await runtime.fetch("/api/sessions/s-owner-shared", { role: "member", ...send("PATCH", { visibility: "private" }) })).status).toBe(403);
  expect((await runtime.fetch("/api/sessions/s-owner-shared", { role: "member", method: "DELETE" })).status).toBe(403);

  // Admins see every session and may stop it.
  const all = await (await runtime.fetch("/api/sessions?view=all", { role: "owner" })).json();
  expect(all.sessions.map((s) => s.id).sort()).toEqual(["s-member-private", "s-owner-private", "s-owner-shared"]);
  expect((await runtime.fetch("/api/sessions/s-member-private", { role: "owner" })).status).toBe(200);

  // Repositories: only admins add or remove; past sessions keep their history.
  expect((await runtime.fetch("/api/repos", { role: "member", ...send("POST", { fullName: "acme/other" }) })).status).toBe(403);
  expect((await runtime.fetch("/api/repos/r1", { role: "member", method: "DELETE" })).status).toBe(403);
  const unvalidated = await runtime.fetch("/api/repos", { role: "owner", ...send("POST", { fullName: "acme/other" }) });
  expect(unvalidated.status).toBe(503);
  expect((await runtime.fetch("/api/repos/r1", { role: "owner", method: "DELETE" })).status).toBe(200);
  const kept = await (await runtime.fetch("/api/sessions/s-member-private", { role: "member" })).json();
  expect(kept.session.repoName).toBe("acme/storefront");
  expect((await (await runtime.fetch("/api/repos", { role: "member" })).json()).repos).toHaveLength(0);

  // Knowledge: visible to all, edited by its author or an admin.
  expect((await runtime.fetch("/api/knowledge/k-owner", { role: "member", ...send("PATCH", { enabled: false }) })).status).toBe(403);
  expect((await runtime.fetch("/api/knowledge/k-owner", { role: "member", method: "DELETE" })).status).toBe(403);
  const mine = await runtime.fetch("/api/knowledge", { role: "member", ...send("POST", { title: "Style", body: "Use tabs.", trigger: "When formatting" }) });
  expect(mine.status).toBe(201);
  const { entry } = await mine.json();
  expect((await runtime.fetch(`/api/knowledge/${entry.id}`, { role: "member", ...send("PATCH", { enabled: false }) })).status).toBe(200);
  expect((await runtime.fetch(`/api/knowledge/${entry.id}`, { role: "owner", ...send("PATCH", { title: "Code style" }) })).status).toBe(200);
  const listedKnowledge = await (await runtime.fetch("/api/knowledge", { role: "member" })).json();
  expect(listedKnowledge.entries.map((e) => e.title).sort()).toEqual(["Code style", "Deploy rules"]);

  // With no model, sandbox or GitHub set up, starting a session is off.
  expect((await runtime.fetch("/api/sessions", { role: "member", ...send("POST", { mode: "ask", repoId: "r1", tier: "lite", prompt: "x" }) })).status).toBe(503);
  const page = await (await runtime.context("member")).newPage();
  await page.goto("/new");
  await expect(page.getByTestId("setup-notice")).toBeVisible();
  await expect(page.getByTestId("start-session")).toBeDisabled();
  await page.goto("/sessions/s-owner-private");
  await expect(page.getByTestId("not-found")).toBeVisible();

  // The app has no sign-in of its own.
  for (const path of ["/login", "/signin", "/signup", "/logout"]) {
    expect((await runtime.fetch(path, { role: "member" })).status).toBe(404);
  }
  await page.goto("/");
  await expect(page.locator("input[type=password]")).toHaveCount(0);
} finally {
  await runtime.close();
}
