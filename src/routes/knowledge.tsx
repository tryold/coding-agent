import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Picker } from "@/client/components/Picker";
import { errorMessage } from "@/client/components/SessionBits";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";
import { createKnowledge, deleteKnowledge, getKnowledge, updateKnowledge } from "@/serverFunctions/app";

export const Route = createFileRoute("/knowledge")({
  loader: () => getKnowledge(),
  head: () => ({ meta: [{ title: "Knowledge · Coding Agent" }] }),
  component: Knowledge,
});

type Data = ReturnType<typeof Route.useLoaderData>;
type Entry = Data["entries"][number];

function Knowledge() {
  const { entries, repos } = Route.useLoaderData();
  const router = useRouter();
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        title="Knowledge"
        description="Given to the agent in every session on a matching repository."
        actions={
          <Button data-testid="knowledge-new" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            New entry
          </Button>
        }
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {entries.length === 0 ? (
        <EmptyState
          title="No knowledge yet"
          description="Add conventions, commands and gotchas the agent should follow."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {entries.map((entry) => (
            <li key={entry.id} data-testid="knowledge-row" className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{entry.title}</p>
                  <Badge variant="outline">{entry.repoName ?? "All repositories"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{entry.trigger}</p>
                <p className="line-clamp-2 text-sm">{entry.body}</p>
                <p className="text-xs text-muted-foreground">{entry.authorEmail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  aria-label={entry.enabled ? "On" : "Off"}
                  data-testid="knowledge-enabled"
                  checked={entry.enabled}
                  disabled={!entry.canEdit}
                  onCheckedChange={async (enabled) => {
                    setError(null);
                    try {
                      await updateKnowledge({ data: { id: entry.id, enabled } });
                      await router.invalidate();
                    } catch (cause) {
                      setError(errorMessage(cause));
                    }
                  }}
                />
                {entry.canEdit ? (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" data-testid="knowledge-edit" onClick={() => setEditing(entry)}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDeleting(entry)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <EntryDialog
          entry={editing === "new" ? null : editing}
          repos={repos}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await router.invalidate();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting.title}"?`}
          confirmLabel="Delete"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteKnowledge({ data: { id: deleting.id } });
            setDeleting(null);
            await router.invalidate();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function EntryDialog({
  entry,
  repos,
  onClose,
  onSaved,
}: {
  entry: Entry | null;
  repos: Data["repos"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [trigger, setTrigger] = useState(entry?.trigger ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [repoId, setRepoId] = useState(entry?.repoId ?? "all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const fields = { title, trigger, body, repoId: repoId === "all" ? null : repoId };
    try {
      if (entry) await updateKnowledge({ data: { id: entry.id, ...fields } });
      else await createKnowledge({ data: fields });
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{entry ? "Edit entry" : "New entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="k-title">Title</Label>
            <Input id="k-title" data-testid="knowledge-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="k-trigger">When it applies</Label>
            <Input
              id="k-trigger"
              data-testid="knowledge-trigger"
              required
              placeholder="When touching the billing code"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="k-body">Knowledge</Label>
            <Textarea id="k-body" data-testid="knowledge-body" rows={6} required value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="k-repo">Repository</Label>
            <Picker
              id="k-repo"
              testId="knowledge-repo"
              value={repoId}
              onChange={setRepoId}
              items={[{ value: "all", label: "All repositories" }, ...repos.map((r: { id: string; fullName: string }) => ({ value: r.id, label: r.fullName }))]}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" data-testid="knowledge-save" pending={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
