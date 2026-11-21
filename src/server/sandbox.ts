import { gatewayRefusal, integrationFetch } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { callFor } from "./callFor";
import { HttpError } from "./access";
import { SetupNeeded } from "./github";

const API = "https://app.daytona.io/api";
export const WORKDIR = "/home/daytona/work";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const fetchSandbox = integrationFetch({ env, provider: "daytona", ...callFor() });
  const response = await fetchSandbox(`${API}${path}`, {
    ...init,
    headers: init.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init.headers },
  });
  if (await gatewayRefusal(response)) throw new SetupNeeded("The sandbox provider");
  if (!response.ok) {
    throw new HttpError(502, `Sandbox: ${response.status} ${await response.text()}`.slice(0, 300));
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilStarted(id: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const sandbox = await call<{ state: string }>(`/sandbox/${id}`);
    if (sandbox.state === "started") return;
    if (sandbox.state === "error" || sandbox.state === "destroyed") {
      throw new HttpError(502, `The sandbox is ${sandbox.state}.`);
    }
    await sleep(2000);
  }
  throw new HttpError(504, "The sandbox didn't start in time.");
}

export async function createSandbox(sessionId: string): Promise<string> {
  const sandbox = await call<{ id: string; state?: string }>("/sandbox", {
    method: "POST",
    body: JSON.stringify({
      labels: { app: "coding-agent", session: sessionId },
      autoStopInterval: 30,
    }),
  });
  if (sandbox.state !== "started") await waitUntilStarted(sandbox.id);
  return sandbox.id;
}

/** Starts a sandbox that stopped while idle. */
export async function resumeSandbox(id: string): Promise<void> {
  const sandbox = await call<{ state: string }>(`/sandbox/${id}`);
  if (sandbox.state === "started") return;
  await call(`/sandbox/${id}/start`, { method: "POST" });
  await waitUntilStarted(id);
}

export async function deleteSandbox(id: string): Promise<void> {
  await call(`/sandbox/${id}`, { method: "DELETE" }).catch(() => undefined);
}

/** Puts a file into the sandbox. */
export async function upload(id: string, path: string, file: Blob): Promise<void> {
  const form = new FormData();
  form.append("file", file, path.split("/").pop());
  await call(`/toolbox/${id}/toolbox/files/upload?path=${encodeURIComponent(path)}`, {
    method: "POST",
    body: form,
  });
}

export interface Ran {
  exitCode: number;
  output: string;
}

/** Runs a shell command in the sandbox's working copy. */
export async function exec(id: string, command: string, timeout = 300): Promise<Ran> {
  const ran = await call<{ exitCode: number; result: string }>(
    `/toolbox/${id}/toolbox/process/execute`,
    {
      method: "POST",
      body: JSON.stringify({
        command: `bash -lc ${quote(`mkdir -p ${WORKDIR} && cd ${WORKDIR} && ${command}`)}`,
        timeout,
      }),
    },
  );
  return { exitCode: ran.exitCode, output: ran.result ?? "" };
}

/** A single-quoted shell word. */
export function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
