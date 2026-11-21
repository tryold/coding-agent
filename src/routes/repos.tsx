import { createFileRoute, useRouter } from "@tanstack/react-router";
import { GitBranch, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { errorMessage } from "@/client/components/SessionBits";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { addRepo, getRepos, removeRepo, updateRepo } from "@/serverFunctions/app";

export const Route = createFileRoute("/repos")({
  loader: () => getRepos(),
  head: () => ({ meta: [{ title: "Repositories · Coding Agent" }] }),
  component: Repos,
});

type Repo = ReturnType<typeof Route.useLoaderData>["repos"][number];

function Repos() {
  const { repos, admin } = Route.useLoaderData();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [branch, setBranch] = useState("");
  const [setup, setSetup] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Repo | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addRepo({ data: { fullName, defaultBranch: branch || undefined, setupCommand: setup || undefined } });
      setFullName("");
      setBranch("");
      setSetup("");
      await router.invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell nav={<Nav />}>
      <PageHeader title="Repositories" />
      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a repository</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={add} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="repo-name">GitHub repository</Label>
                  <Input
                    id="repo-name"
                    data-testid="repo-name-input"
                    placeholder="owner/name"
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repo-branch">Default branch</Label>
                  <Input
                    id="repo-branch"
                    placeholder="From GitHub"
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="repo-setup">Setup command</Label>
                <Input
                  id="repo-setup"
                  data-testid="repo-setup-input"
                  placeholder="npm ci"
                  className="font-mono"
                  value={setup}
                  onChange={(event) => setSetup(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">Runs in the sandbox before each session starts work.</p>
              </div>
              {error ? (
                <p className="text-sm text-destructive" data-testid="repo-error">
                  {error}
                </p>
              ) : null}
              <Button type="submit" data-testid="repo-add" pending={pending}>
                Add repository
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {repos.length === 0 ? (
        <EmptyState
          title="No repositories yet"
          description={admin ? "Add one above to start sessions on it." : "An admin adds the repositories sessions can use."}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {repos.map((repo) => (
            <RepoRow key={repo.id} repo={repo} admin={admin} onRemove={() => setRemoving(repo)} />
          ))}
        </ul>
      )}
      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.fullName}?`}
          confirmLabel="Remove"
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await removeRepo({ data: { id: removing.id } });
            setRemoving(null);
            await router.invalidate();
          }}
        >
          New sessions can't use it.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function RepoRow({ repo, admin, onRemove }: { repo: Repo; admin: boolean; onRemove: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [setup, setSetup] = useState(repo.setupCommand ?? "");
  const [pending, setPending] = useState(false);
  return (
    <li data-testid="repo-row" className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{repo.fullName}</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <GitBranch className="size-3.5" aria-hidden />
            {repo.defaultBranch}
          </p>
        </div>
        {admin ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing((on) => !on)}>
              Edit setup
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${repo.fullName}`} data-testid="repo-remove" onClick={onRemove}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            await updateRepo({ data: { id: repo.id, setupCommand: setup } });
            setPending(false);
            setEditing(false);
            await router.invalidate();
          }}
        >
          <Input
            aria-label="Setup command"
            className="font-mono"
            value={setup}
            onChange={(event) => setSetup(event.target.value)}
          />
          <Button type="submit" size="sm" pending={pending}>
            Save
          </Button>
        </form>
      ) : repo.setupCommand ? (
        <p className="truncate font-mono text-xs text-muted-foreground">$ {repo.setupCommand}</p>
      ) : null}
    </li>
  );
}
