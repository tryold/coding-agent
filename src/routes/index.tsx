import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Picker } from "@/client/components/Picker";
import { PullBadge, STATUS_LABELS, StatusBadge, timeAgo, type Status } from "@/client/components/SessionBits";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { getSessions } from "@/serverFunctions/app";

const search = z.object({
  view: z.enum(["mine", "shared", "all"]).catch("mine").default("mine"),
  status: z.enum(["queued", "working", "waiting", "finished", "failed", "stopped"]).optional().catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getSessions({ data: deps }),
  head: () => ({ meta: [{ title: "Sessions · Coding Agent" }] }),
  component: Sessions,
});

const STATUS_ITEMS = [
  { value: "any", label: "Any status" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function Sessions() {
  const { sessions, admin } = Route.useLoaderData();
  const { view, status } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  return (
    <AppShell nav={<Nav />}>
      <PageHeader
        title="Sessions"
        actions={
          <Button render={<Link to="/new" />} nativeButton={false}>
            <Plus aria-hidden />
            New session
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={view}
          onValueChange={(next) => navigate({ search: (s) => ({ ...s, view: next as typeof view }) })}
        >
          <TabsList>
            <TabsTrigger value="mine" data-testid="view-mine">
              Mine
            </TabsTrigger>
            <TabsTrigger value="shared" data-testid="view-shared">
              Shared
            </TabsTrigger>
            {admin ? (
              <TabsTrigger value="all" data-testid="view-all">
                All
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
        <Picker
          className="w-44"
          testId="status-filter"
          value={status ?? "any"}
          items={STATUS_ITEMS}
          onChange={(next) =>
            navigate({ search: (s) => ({ ...s, status: next === "any" ? undefined : (next as Status) }) })
          }
        />
      </div>
      {sessions.length === 0 ? (
        status ? (
          <EmptyState kind="filtered" title={`No ${STATUS_LABELS[status].toLowerCase()} sessions`} />
        ) : view === "shared" ? (
          <EmptyState title="Nothing shared yet" description="Sessions teammates share appear here." />
        ) : (
          <EmptyState
            title="No sessions yet"
            description="Start one to ask about a repository or hand the agent a task."
            action={
              <Button render={<Link to="/new" />} nativeButton={false}>
                New session
              </Button>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {sessions.map((session) => (
            <li key={session.id} data-testid="session-row">
              <Link
                to="/sessions/$id"
                params={{ id: session.id }}
                className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-medium">{session.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {session.repoName}
                    {view !== "mine" ? ` · ${session.ownerEmail}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {session.mode === "ask" ? <Badge variant="outline">Ask</Badge> : null}
                  {session.pullRequest ? (
                    <PullBadge number={session.pullRequest.number} state={session.pullRequest.state} />
                  ) : null}
                  <StatusBadge status={session.status} />
                  <span className="text-xs text-muted-foreground">{timeAgo(session.lastActivityAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
