import { integrationStatus } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { modelReady } from "./model";

export interface Readiness {
  ready: boolean;
  missing: string[];
}

/** Whether sessions can start: a model, a sandbox provider and GitHub. */
export async function readiness(): Promise<Readiness> {
  const [github, daytona, model] = await Promise.all([
    integrationStatus({ env, provider: "github" }).then((s) => s.ready, () => false),
    integrationStatus({ env, provider: "daytona" }).then((s) => s.ready, () => false),
    modelReady(),
  ]);
  const missing = [
    ...(model ? [] : ["a model (OpenRouter)"]),
    ...(daytona ? [] : ["sandboxes (Daytona)"]),
    ...(github ? [] : ["GitHub"]),
  ];
  return { ready: missing.length === 0, missing };
}
