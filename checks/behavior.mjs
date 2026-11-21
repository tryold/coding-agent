// Main paths of every feature, against the packaged release, with the
// model, sandbox and GitHub answered by checks/fake-gateway.mjs.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway } from "./fake-gateway.mjs";

const runtime = await startRuntime(fakeGateway);
const SLOW = { timeout: 30_000 };
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function pick(page, trigger, option) {
  await page.getByTestId(trigger).click();
  await page.getByRole("option", { name: option }).click();
}

try {
  await runtime.assertPrivateAccess(["/", "/repos", "/knowledge", "/new", "/api/sessions", "/api/repos"]);
  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();

  // F001: an admin adds a repository, validated on GitHub.
  await owner.goto("/repos");
  await runtime.assertBackLink(owner);
  await owner.getByTestId("repo-name-input").fill("acme/missing");
  await owner.getByTestId("repo-add").click();
  await expect(owner.getByTestId("repo-error")).toBeVisible();
  await owner.getByTestId("repo-name-input").fill("acme/storefront");
  await owner.getByTestId("repo-setup-input").fill("npm ci");
  await owner.getByTestId("repo-add").click();
  const repoRow = owner.getByTestId("repo-row").filter({ hasText: "acme/storefront" });
  await expect(repoRow).toContainText("main");
  await expect(repoRow).toContainText("npm ci");
  // Members see the list but can't add or remove.
  await member.goto("/repos");
  await expect(member.getByTestId("repo-row").filter({ hasText: "acme/storefront" })).toBeVisible();
  await expect(member.getByTestId("repo-add")).toHaveCount(0);
  await expect(member.getByTestId("repo-remove")).toHaveCount(0);
  const repos = await (await runtime.fetch("/api/repos", { role: "member" })).json();
  expect(repos.repos.map((r) => r.fullName)).toContain("acme/storefront");

  // F006: a knowledge entry scoped to the repository.
  await owner.goto("/knowledge");
  await owner.getByTestId("knowledge-new").click();
  await owner.getByTestId("knowledge-title").fill("Test conventions");
  await owner.getByTestId("knowledge-trigger").fill("When changing or adding tests");
  await owner.getByTestId("knowledge-body").fill("Tests live in test/ and run with npm test. Keep one assertion per case.");
  await pick(owner, "knowledge-repo", "acme/storefront");
  await owner.getByTestId("knowledge-save").click();
  const entry = owner.getByTestId("knowledge-row").filter({ hasText: "Test conventions" });
  await expect(entry).toContainText("acme/storefront");
  // A disabled entry isn't given to sessions; another one stays off.
  await owner.getByTestId("knowledge-new").click();
  await owner.getByTestId("knowledge-title").fill("Old release steps");
  await owner.getByTestId("knowledge-trigger").fill("When publishing");
  await owner.getByTestId("knowledge-body").fill("Tag and push.");
  await owner.getByTestId("knowledge-save").click();
  const old = owner.getByTestId("knowledge-row").filter({ hasText: "Old release steps" });
  await old.getByTestId("knowledge-enabled").click();
  await expect(old.getByTestId("knowledge-enabled")).toHaveAttribute("aria-checked", "false");
  // Members see organization entries, but only the author or an admin edits.
  await member.goto("/knowledge");
  await expect(member.getByTestId("knowledge-row").filter({ hasText: "Test conventions" })).toBeVisible();
  await expect(member.getByTestId("knowledge-row").filter({ hasText: "Test conventions" }).getByTestId("knowledge-edit")).toHaveCount(0);

  // F003: ask about the repository; the answer cites files.
  await owner.goto("/new");
  await owner.getByTestId("mode-ask").click();
  await pick(owner, "repo-select", "acme/storefront");
  await owner.getByTestId("prompt-input").fill("How are greetings built, and how would we add custom punctuation?");
  await Promise.all([owner.waitForURL(/\/sessions\/[^/]+$/), owner.getByTestId("start-session").click()]);
  const askUrl = owner.url();
  const answer = owner.getByTestId("step-answer").first();
  await expect(answer).toContainText("greet()", SLOW);
  await expect(answer.getByTestId("citation").first()).toHaveText("src/greeting.js");
  await expect(owner.getByTestId("session-status")).toHaveText("Finished", SLOW);
  await expect(owner.getByTestId("knowledge-used")).toContainText("Test conventions");
  await expect(owner.getByTestId("knowledge-used")).not.toContainText("Old release steps");

  // Hand-off: the plan becomes an agent session's prompt.
  await answer.getByTestId("handoff-button").click();
  const handoff = owner.getByTestId("handoff-prompt");
  await expect(handoff).toHaveValue(/punctuation/);
  await handoff.fill((await handoff.inputValue()) + "\nKeep '!' as the default.");
  await pick(owner, "handoff-tier", "Ultra");
  await Promise.all([owner.waitForURL((u) => u.href !== askUrl && /\/sessions\//.test(u.href)), owner.getByTestId("handoff-start").click()]);
  const agentUrl = owner.url();

  // F002 + F004: the agent works in steps and opens a pull request.
  await expect(owner.getByTestId("session-status")).toHaveText("Finished", SLOW);
  await expect(owner.getByTestId("session-details")).toContainText("Ultra");
  await expect(owner.getByTestId("step-file").first()).toContainText("src/greeting.js");
  await expect(owner.getByTestId("step-file").first()).toContainText("+4");
  const command = owner.getByTestId("step-command").filter({ hasText: "npm test" }).first();
  await expect(command).toContainText("2 passing");
  await expect(command).toContainText("exit 0");
  const pr = owner.getByTestId("pr-card");
  await expect(pr).toContainText("#42");
  await expect(pr).toContainText("Add punctuation option to greet()");
  await expect(pr).toContainText("Open");
  await expect(pr.getByTestId("pr-link")).toHaveAttribute("href", "https://github.com/acme/storefront/pull/42");
  await expect(owner.getByTestId("session-details")).toContainText("Test conventions");

  // A follow-up resumes the same session and pushes to the same pull request.
  await owner.getByTestId("message-input").fill("Also trim whitespace from names before greeting.");
  await owner.getByTestId("message-send").click();
  await expect(owner.getByTestId("step-user").last()).toContainText("trim whitespace");
  await expect(owner.getByTestId("step-file")).toHaveCount(2, SLOW);
  await expect(owner.getByTestId("session-status")).toHaveText("Finished", SLOW);
  await expect(owner.getByTestId("pr-card")).toContainText("#42");
  await expect(owner.getByTestId("pr-card")).toContainText("2 commits");

  // Refresh reads the PR's state back from GitHub.
  await owner.getByTestId("pr-refresh").click();
  await expect(owner.getByTestId("pr-card")).toContainText("Merged");

  // The ask thread shows the session it started, with its status.
  await owner.goto(askUrl);
  await expect(owner.getByTestId("linked-session")).toContainText("Finished");

  // The list: title, repo, status, PR badge, filter by status.
  await owner.goto("/");
  const rows = owner.getByTestId("session-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ has: owner.getByTestId("pr-badge") })).toHaveCount(1);
  await pick(owner, "status-filter", "Working");
  await expect(rows).toHaveCount(0);
  await pick(owner, "status-filter", "Finished");
  await expect(rows).toHaveCount(2);
  const listed = await (await runtime.fetch("/api/sessions?status=finished", { role: "owner" })).json();
  expect(listed.sessions.find((s) => s.pullRequest)?.pullRequest.number).toBe(42);

  // F005: the owner shares the session and allows collaboration.
  const agentId = agentUrl.split("/").pop();
  await member.goto(agentUrl);
  await expect(member.getByTestId("not-found")).toBeVisible();
  await owner.goto(agentUrl);
  await owner.getByTestId("share-toggle").click();
  await expect(owner.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  await member.goto("/");
  await member.getByTestId("view-shared").click();
  await expect(member.getByTestId("session-row")).toHaveCount(1);
  await member.goto(agentUrl);
  await expect(member.getByTestId("pr-card")).toContainText("#42");
  await expect(member.getByTestId("message-input")).toHaveCount(0);
  await expect(member.getByTestId("session-stop")).toHaveCount(0);
  await expect(member.getByTestId("share-toggle")).toHaveCount(0);
  await owner.getByTestId("collaborate-toggle").click();
  await expect(owner.getByTestId("collaborate-toggle")).toHaveAttribute("aria-checked", "true");
  await member.reload();
  await member.getByTestId("message-input").fill("Could you also add a doc comment to greet()?");
  await member.getByTestId("message-send").click();
  await expect(member.getByTestId("step-user").last()).toContainText("doc comment");
  await expect(member.getByTestId("step-user").last()).toContainText("member@example.test");
  await expect(member.getByTestId("session-status")).toHaveText("Finished", SLOW);
  const asMember = await runtime.fetch(`/api/sessions/${agentId}`, { role: "member" });
  expect(asMember.status).toBe(200);

  // Stop: start one more session and stop it as its owner.
  const started = await runtime.fetch("/api/sessions", { role: "owner", ...json({ mode: "agent", repoId: repos.repos[0].id, tier: "lite", prompt: "Rename greet to sayHello everywhere" }) });
  expect(started.status).toBe(201);
  const { session: toStop } = await started.json();
  const stopped = await runtime.fetch(`/api/sessions/${toStop.id}/stop`, { role: "owner", method: "POST" });
  expect(stopped.status).toBe(200);
  expect((await (await runtime.fetch(`/api/sessions/${toStop.id}`, { role: "owner" })).json()).session.status).toBe("stopped");

  // A phone-sized look at the session list.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await phone.getByTestId("view-shared").click();
  await expect(phone.getByTestId("session-row").first()).toBeVisible();

  // The result on screen: the finished session with its pull request.
  await owner.goto(agentUrl);
  await expect(owner.getByTestId("pr-card")).toContainText("Merged");
  await owner.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
  await runtime.screenshot(owner);
} finally {
  await runtime.close();
}
