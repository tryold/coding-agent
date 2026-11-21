import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowRight, FileCode, GitPullRequest, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Picker } from "@/client/components/Picker";
import {
  errorMessage,
  PullBadge,
  pullLabel,
  StatusBadge,
  TIER_ITEMS,
  timeAgo,
  type Tier,
} from "@/client/components/SessionBits";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";
import {
  deleteSession,
  getSession,
  refreshPull,
  sendMessage,
  setSharing,
  startSession,
  stopSession,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/sessions/$id")({
  loader: async ({ params }) => {
    const found = await getSession({ data: { id: params.id } });
    if (!found) throw notFound();
    return found;
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.session.title ?? "Session"} · Coding Agent` }] }),
  notFoundComponent: () => (
    <AppShell nav={<Nav />}>
      <div data-testid="not-found">
        <EmptyState kind="filtered" title="No such session" description="It was deleted, or its owner hasn't shared it." />
      </div>
    </AppShell>
  ),
  component: KeyedSessionPage,
});

// A new session id starts the page afresh: no dialog or draft carries over.
function KeyedSessionPage() {
  const { id } = Route.useParams();
  return <SessionPage key={id} />;
}

type Data = ReturnType<typeof Route.useLoaderData>;
type StepRow = Data["steps"][number];

const ACTIVE = new Set(["queued", "working"]);

function SessionPage() {
  const data = Route.useLoaderData();
  const { session, steps, pullRequest, knowledge, linked, thread, can } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  const active = ACTIVE.has(session.status) || linked.some((s) => ACTIVE.has(s.status));

  // Steps arrive as the agent works: read them again while it runs.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void router.invalidate(), 1500);
    return () => clearInterval(timer);
  }, [active, router]);

  async function act(name: string, work: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        title={session.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{session.repoName}</span>
            <span>·</span>
            <span>{session.mode === "ask" ? "Ask" : `Agent, ${session.tierLabel}`}</span>
            {!can.own ? (
              <>
                <span>·</span>
                <span>{session.ownerEmail}</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <>
            <StatusBadge status={session.status} testId="session-status" />
            {can.manage && ["queued", "working", "waiting"].includes(session.status) ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="session-stop"
                pending={busy === "stop"}
                onClick={() => act("stop", () => stopSession({ data: { id: session.id } }))}
              >
                Stop
              </Button>
            ) : null}
            {can.manage ? (
              <Button variant="ghost" size="sm" data-testid="session-delete" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      {thread ? (
        <p className="text-sm text-muted-foreground">
          Started from{" "}
          <Link to="/sessions/$id" params={{ id: thread.id }} className="text-primary underline-offset-4 hover:underline">
            {thread.title}
          </Link>
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {pullRequest ? (
        <PullCard
          pr={pullRequest}
          refreshing={busy === "refresh"}
          onRefresh={() => act("refresh", () => refreshPull({ data: { id: session.id } }))}
        />
      ) : null}

      {linked.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Agent sessions from this thread</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {linked.map((other) => (
              <li key={other.id} data-testid="linked-session">
                <Link
                  to="/sessions/$id"
                  params={{ id: other.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="truncate">{other.title}</span>
                  <StatusBadge status={other.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="space-y-3">
        {steps.map((step) => (
          <StepItem
            key={step.id}
            step={step}
            onHandoff={session.mode === "ask" ? (text) => setHandoff(text) : undefined}
          />
        ))}
        {ACTIVE.has(session.status) ? (
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {session.status === "queued" ? "Queued" : "Working"}
          </li>
        ) : null}
      </ol>

      {can.message ? (
        <Composer
          waiting={session.status === "waiting"}
          onSend={(text) => act("send", () => sendMessage({ data: { id: session.id, text } }))}
          pending={busy === "send"}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card size="sm" data-testid="session-details">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Repository</dt>
              <dd>{session.repoName}</dd>
              {session.mode === "agent" ? (
                <>
                  <dt className="text-muted-foreground">Tier</dt>
                  <dd>{session.tierLabel}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="truncate">{session.ownerEmail}</dd>
              <dt className="text-muted-foreground">Last activity</dt>
              <dd>{timeAgo(session.lastActivityAt)}</dd>
              <dt className="text-muted-foreground">Knowledge</dt>
              <dd data-testid="knowledge-used">
                {knowledge.length ? (
                  <ul className="space-y-0.5">
                    {knowledge.map((entry) => (
                      <li key={entry.id}>{entry.title}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </dd>
            </dl>
          </CardContent>
        </Card>
        {can.manage ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Sharing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                Share with the organization
                <Switch
                  data-testid="share-toggle"
                  checked={session.visibility === "org"}
                  onCheckedChange={(checked) =>
                    act("share", () => setSharing({ data: { id: session.id, visibility: checked ? "org" : "private" } }))
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                Let members send messages
                <Switch
                  data-testid="collaborate-toggle"
                  disabled={session.visibility !== "org"}
                  checked={session.collaborate}
                  onCheckedChange={(checked) =>
                    act("collaborate", () => setSharing({ data: { id: session.id, collaborate: checked } }))
                  }
                />
              </label>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this session?"
          confirmLabel="Delete"
          destructive
          pending={busy === "delete"}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            act("delete", async () => {
              await deleteSession({ data: { id: session.id } });
              await navigate({ to: "/" });
            })
          }
        >
          Its steps are gone for good. A pull request stays open on GitHub.
        </ConfirmDialog>
      ) : null}

      {handoff !== null ? (
        <HandoffDialog
          initial={handoff}
          onClose={() => setHandoff(null)}
          onStart={async (prompt, tier) => {
            const started = await startSession({
              data: { mode: "agent", repoId: session.repoId, tier, prompt, threadId: session.id },
            });
            setHandoff(null);
            await navigate({ to: "/sessions/$id", params: { id: started.id } });
          }}
        />
      ) : null}
    </AppShell>
  );
}

function PullCard({
  pr,
  refreshing,
  onRefresh,
}: {
  pr: NonNullable<Data["pullRequest"]>;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card data-testid="pr-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <GitPullRequest className="size-4" aria-hidden />
          <a href={pr.url} target="_blank" rel="noreferrer" data-testid="pr-link" className="underline-offset-4 hover:underline">
            #{pr.number} {pr.title}
          </a>
          <PullBadge number={pr.number} state={pr.state} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {pr.summary ? <p className="whitespace-pre-wrap">{pr.summary}</p> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span className="font-mono">{pr.branch}</span>
          <span>
            {pr.filesChanged} {pr.filesChanged === 1 ? "file" : "files"}
          </span>
          <span>
            <span className="text-success">+{pr.additions}</span>{" "}
            <span className="text-destructive">−{pr.deletions}</span>
          </span>
          <span>
            {pr.commits} {pr.commits === 1 ? "commit" : "commits"}
          </span>
          <span className="sr-only">{pullLabel(pr.state)}</span>
        </div>
        <Button variant="outline" size="sm" data-testid="pr-refresh" pending={refreshing} onClick={onRefresh}>
          <RefreshCw aria-hidden />
          Refresh state
        </Button>
      </CardContent>
    </Card>
  );
}

function StepItem({ step, onHandoff }: { step: StepRow; onHandoff?: (text: string) => void }) {
  if (step.kind === "user") {
    return (
      <li data-testid="step-user" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">{step.authorEmail}</p>
        <p className="whitespace-pre-wrap">{step.text}</p>
      </li>
    );
  }
  if (step.kind === "command") {
    return (
      <li data-testid="step-command" className="overflow-hidden rounded-xl border border-border bg-card text-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <span className="flex min-w-0 items-center gap-2 font-mono">
            <Terminal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{step.command}</span>
          </span>
          <Badge variant={step.exitCode === 0 ? "outline" : "destructive"}>exit {step.exitCode}</Badge>
        </div>
        {step.output ? (
          <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {step.output}
          </pre>
        ) : null}
      </li>
    );
  }
  if (step.kind === "file") {
    return (
      <li data-testid="step-file" className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm">
        <FileCode className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono">{step.path}</span>
        <span className="text-success">+{step.additions}</span>
        <span className="text-destructive">−{step.deletions}</span>
      </li>
    );
  }
  if (step.kind === "answer") {
    return (
      <li data-testid="step-answer" className="space-y-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{step.text}</p>
        {step.files.length ? (
          <div className="flex flex-wrap gap-1.5">
            {step.files.map((file: string) => (
              <Badge key={file} variant="outline" className="font-mono" data-testid="citation">
                {file}
              </Badge>
            ))}
          </div>
        ) : null}
        {onHandoff ? (
          <Button size="sm" variant="outline" data-testid="handoff-button" onClick={() => onHandoff(step.text ?? "")}>
            Start agent session
            <ArrowRight aria-hidden />
          </Button>
        ) : null}
      </li>
    );
  }
  if (step.kind === "question") {
    return (
      <li data-testid="step-question" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{step.text}</p>
      </li>
    );
  }
  if (step.kind === "error") {
    return (
      <li data-testid="step-error" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {step.text}
      </li>
    );
  }
  return (
    <li data-testid="step-message" className="px-1 text-sm whitespace-pre-wrap">
      {step.text}
    </li>
  );
}

function Composer({ waiting, pending, onSend }: { waiting: boolean; pending: boolean; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        await onSend(text);
        setText("");
      }}
    >
      <Label htmlFor="message" className="sr-only">
        Message
      </Label>
      <Textarea
        id="message"
        data-testid="message-input"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={waiting ? "Reply to the agent" : "Send a follow-up"}
      />
      <Button type="submit" size="sm" data-testid="message-send" pending={pending} disabled={!text.trim()}>
        Send
      </Button>
    </form>
  );
}

function HandoffDialog({
  initial,
  onClose,
  onStart,
}: {
  initial: string;
  onClose: () => void;
  onStart: (prompt: string, tier: Tier) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(initial);
  const [tier, setTier] = useState<Tier>("normal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Start an agent session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="handoff-prompt">Task</Label>
            <Textarea
              id="handoff-prompt"
              data-testid="handoff-prompt"
              rows={8}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="handoff-tier">Agent tier</Label>
            <Picker id="handoff-tier" testId="handoff-tier" value={tier} onChange={setTier} items={[...TIER_ITEMS]} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            data-testid="handoff-start"
            pending={pending}
            disabled={!prompt.trim()}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await onStart(prompt, tier);
              } catch (cause) {
                setError(errorMessage(cause));
                setPending(false);
              }
            }}
          >
            Start session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
