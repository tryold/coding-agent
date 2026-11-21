// Written data survives a restart of the Workers.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGateway } from "./fake-gateway.mjs";

const runtime = await startRuntime(fakeGateway);
const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
try {
  const added = await runtime.fetch("/api/repos", { role: "owner", ...post({ fullName: "acme/storefront", setupCommand: "pnpm install" }) });
  expect(added.status).toBe(201);
  const { repo } = await added.json();
  expect((await runtime.fetch("/api/knowledge", { role: "member", ...post({ title: "Lint first", body: "Run pnpm lint before tests.", trigger: "Before running tests", repoId: repo.id }) })).status).toBe(201);
  const started = await runtime.fetch("/api/sessions", { role: "member", ...post({ mode: "ask", repoId: repo.id, tier: "normal", prompt: "Where is the greeting built?" }) });
  expect(started.status).toBe(201);
  const { session } = await started.json();
  await expect.poll(async () => { const d = await (await runtime.fetch(`/api/sessions/${session.id}`, { role: "member" })).json(); return d.session.status; }, { timeout: 30_000 }).toBe("finished");

  await runtime.restart();

  const back = await (await runtime.fetch(`/api/sessions/${session.id}`, { role: "member" })).json();
  expect(back.session.status).toBe("finished");
  expect(back.session.title).toContain("greeting");
  expect(back.steps.some((s) => s.kind === "answer" && s.files.includes("src/greeting.js"))).toBe(true);
  expect(back.knowledge.map((k) => k.title)).toEqual(["Lint first"]);
  const repos = await (await runtime.fetch("/api/repos", { role: "member" })).json();
  expect(repos.repos[0]).toMatchObject({ fullName: "acme/storefront", defaultBranch: "main", setupCommand: "pnpm install" });
  const knowledge = await (await runtime.fetch("/api/knowledge", { role: "member" })).json();
  expect(knowledge.entries[0]).toMatchObject({ title: "Lint first", trigger: "Before running tests", enabled: true });
  const page = await (await runtime.context("member")).newPage();
  await page.goto(`/sessions/${session.id}`);
  await expect(page.getByTestId("step-answer")).toContainText("greet()");
} finally {
  await runtime.close();
}
