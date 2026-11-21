// A local stand-in for the Gateway's brokered APIs (model, sandbox, GitHub),
// used only by these checks. It answers the way those APIs do, from a script.
const SCRIPT = String.raw`
const json = (body, status = 200) => Response.json(body, { status });
let commits = 0;
const CONTENT = "export function greet(name) {\n  return 'Hello, ' + name + '!';\n}\n";
function lastTool(messages) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "tool") return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.tool_calls) {
      const call = m.tool_calls.find((c) => c.id === last.tool_call_id);
      if (call) return call.function.name;
    }
  }
  return null;
}
const call = (name, args, content) => json({
  id: "cmpl", object: "chat.completion",
  choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: content ?? null,
    tool_calls: [{ id: "call_" + Math.random().toString(36).slice(2, 8), type: "function", function: { name, arguments: JSON.stringify(args) } }] } }],
});
async function model(body) {
  if (String(body.messages.find((m) => m.role === "user")?.content).includes("Rename")) await new Promise((r) => setTimeout(r, 4000));
  const tools = (body.tools || []).map((t) => t.function.name);
  const messages = body.messages;
  const prev = lastTool(messages);
  if (tools.includes("answer")) {
    if (!prev) return call("search", { query: "greet" }, "Looking for where greetings are built.");
    return call("answer", { answer: "Greetings come from greet() in src/greeting.js. Plan: add an optional punctuation argument to greet(), default it to '!', and cover both cases in test/greeting.test.js.", files: ["src/greeting.js", "test/greeting.test.js"] });
  }
  const followUps = messages.filter((m) => m.role === "user").length;
  if (!prev || prev === "finish") return call("write_file", { path: "src/greeting.js", content: CONTENT + (followUps > 1 ? "// trims names\n" : "") }, followUps > 1 ? "Trimming the name before greeting." : "Plan: update greet() and run the test suite.");
  if (prev === "write_file") return call("run_command", { command: "npm test" });
  return call("finish", { title: "Add punctuation option to greet()", summary: "greet() now takes an optional punctuation mark. Tests pass." });
}
function sandbox(url, method, body) {
  const p = url.pathname;
  if (method === "POST" && p.endsWith("/api/sandbox")) return json({ id: "sbx-1", state: "started" });
  if (/\/api\/sandbox\/[^/]+$/.test(p)) return method === "DELETE" ? json({}) : json({ id: "sbx-1", state: "started" });
  if (p.endsWith("/start")) return json({ id: "sbx-1", state: "started" });
  if (p.endsWith("/files/upload")) return new Response(null, { status: 200 });
  if (p.endsWith("/process/execute")) {
    const c = body.command;
    let result = "";
    if (c.includes("--numstat")) result = "4\t1\tsrc/greeting.js";
    else if (c.includes("--name-status")) result = "M\tsrc/greeting.js";
    else if (c.includes("base64 -w0")) result = btoa(CONTENT);
    else if (c.includes("grep")) result = "src/greeting.js:1:export function greet(name) {";
    else if (c.includes("npm test")) result = "> test\n\n  greet\n    ok 1 adds punctuation\n    ok 2 keeps the default\n\n  2 passing";
    return json({ exitCode: 0, result });
  }
  return json({ message: "not found" }, 404);
}
function github(url, method) {
  const p = url.pathname.replace(/^\/api\/integrations\/github\/api\.github\.com/, "");
  if (!p.startsWith("/repos/acme/storefront")) return json({ message: "Not Found" }, 404);
  const r = p.slice("/repos/acme/storefront".length);
  if (r === "") return json({ full_name: "acme/storefront", default_branch: "main", private: true });
  if (r.startsWith("/git/ref/heads/")) return json({ object: { sha: "base000" } });
  if (r.startsWith("/tarball/")) return new Response("tarball-bytes", { headers: { "content-type": "application/x-gzip" } });
  if (r.startsWith("/git/commits/") && method === "GET") return json({ sha: "base000", tree: { sha: "tree000" } });
  if (r === "/git/blobs") return json({ sha: "blob" + commits }, 201);
  if (r === "/git/trees") return json({ sha: "tree" + commits }, 201);
  if (r === "/git/commits") { commits++; return json({ sha: "commit" + commits, tree: { sha: "tree" + commits } }, 201); }
  if (r === "/git/refs") return json({ ref: "refs/heads/x" }, 201);
  if (r.startsWith("/git/refs/heads/")) return json({ ref: "refs/heads/x" });
  if (r === "/pulls" && method === "POST") return json({ number: 42, html_url: "https://github.com/acme/storefront/pull/42", state: "open", merged: false, additions: 4, deletions: 1, changed_files: 1 }, 201);
  if (r === "/pulls/42") return method === "PATCH" ? json({ number: 42 }) : json({ number: 42, html_url: "https://github.com/acme/storefront/pull/42", state: "closed", merged: true, additions: 4, deletions: 1, changed_files: 1 });
  return json({ message: "Not Found" }, 404);
}
export default { async fetch(request) {
  const url = new URL(request.url);
  const body = request.method === "GET" ? null : await request.json().catch(() => null);
  if (/^\/api\/integrations\/(github|daytona)$/.test(url.pathname)) return json({ requested: true, configured: true, ready: true });
  if (url.pathname.startsWith("/api/ai/") && url.pathname.endsWith("/chat/completions")) return await model(body);
  if (url.pathname.startsWith("/api/integrations/daytona/")) return sandbox(url, request.method, body);
  if (url.pathname.startsWith("/api/integrations/github/")) return github(url, request.method);
  return json({ code: "not_found" }, 404);
} };`;

export const fakeGateway = {
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-gateway" } },
  workers: [{ config: { name: "fake-gateway", compatibilityDate: "2025-01-01",
    manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: SCRIPT } } } } }],
};
