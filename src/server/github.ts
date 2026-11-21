import { gatewayRefusal, integrationFetch } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { callFor } from "./callFor";
import { HttpError } from "./access";

const API = "https://api.github.com";

export class SetupNeeded extends HttpError {
  constructor(what: string) {
    super(503, `${what} isn't set up on the Gateway yet.`);
  }
}

async function call(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const fetchGitHub = integrationFetch({ env, provider: "github", ...callFor() });
  const response = await fetchGitHub(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "coding-agent",
      ...init.headers,
    },
  });
  if (await gatewayRefusal(response)) throw new SetupNeeded("GitHub");
  return response;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await call(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new HttpError(
      response.status === 404 ? 404 : 502,
      `GitHub: ${body.message ?? response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

export interface GitHubRepo {
  fullName: string;
  defaultBranch: string;
}

/** The repository as GitHub has it, or null when the token can't see it. */
export async function findRepo(fullName: string): Promise<GitHubRepo | null> {
  const response = await call(`/repos/${fullName}`);
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new HttpError(502, `GitHub answered ${response.status}.`);
  const repo = (await response.json()) as {
    full_name: string;
    default_branch: string;
  };
  return { fullName: repo.full_name, defaultBranch: repo.default_branch };
}

export async function branchHead(repo: string, branch: string): Promise<string> {
  const ref = await json<{ object: { sha: string } }>(
    `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  return ref.object.sha;
}

/** The repository's files at `sha`, as a gzipped tarball. */
export async function tarball(repo: string, sha: string): Promise<Blob> {
  const response = await call(`/repos/${repo}/tarball/${sha}`);
  if (!response.ok) throw new HttpError(502, `GitHub couldn't send the code (${response.status}).`);
  return response.blob();
}

export interface FileChange {
  path: string;
  /** Base64 contents, or null for a deleted file. */
  content: string | null;
}

/** One commit of `changes` on top of `parent`; returns its sha. */
export async function commit(
  repo: string,
  parent: string,
  message: string,
  changes: FileChange[],
): Promise<string> {
  const parentCommit = await json<{ tree: { sha: string } }>(
    `/repos/${repo}/git/commits/${parent}`,
  );
  const tree = [];
  for (const change of changes) {
    if (change.content === null) {
      tree.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await json<{ sha: string }>(`/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: change.content, encoding: "base64" }),
    });
    tree.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await json<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
  });
  const created = await json<{ sha: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parent] }),
  });
  return created.sha;
}

export async function createBranch(repo: string, branch: string, sha: string) {
  await json(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

export async function moveBranch(repo: string, branch: string, sha: string) {
  await json(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha, force: false }),
  });
}

export interface PullState {
  number: number;
  url: string;
  state: "open" | "merged" | "closed";
}

function pullState(pr: {
  number: number;
  html_url: string;
  state: string;
  merged?: boolean;
  merged_at?: string | null;
}): PullState {
  return {
    number: pr.number,
    url: pr.html_url,
    state:
      pr.merged || pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed",
  };
}

export async function openPull(
  repo: string,
  input: { title: string; body: string; head: string; base: string },
): Promise<PullState> {
  return pullState(
    await json(`/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function readPull(repo: string, number: number): Promise<PullState> {
  return pullState(await json(`/repos/${repo}/pulls/${number}`));
}
