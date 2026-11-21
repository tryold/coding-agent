import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { Nav } from "@/client/components/Nav";
import { PageHeader } from "@/client/components/PageHeader";
import { Picker } from "@/client/components/Picker";
import { errorMessage, TIER_ITEMS, type Tier } from "@/client/components/SessionBits";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Textarea } from "@/client/components/ui/textarea";
import { getNewSession, startSession } from "@/serverFunctions/app";


export const Route = createFileRoute("/new")({
  validateSearch: z.object({ mode: z.enum(["agent", "ask"]).catch("agent").default("agent") }),
  loader: () => getNewSession(),
  head: () => ({ meta: [{ title: "New session · Coding Agent" }] }),
  component: NewSession,
});

function NewSession() {
  const { repos, setup } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"agent" | "ask">(search.mode);
  const [repoId, setRepoId] = useState<string | null>(repos.length === 1 ? repos[0]!.id : null);
  const [tier, setTier] = useState<Tier>("normal");
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!repoId) return setError("Pick a repository.");
    setPending(true);
    setError(null);
    try {
      const session = await startSession({ data: { mode, repoId, tier, prompt } });
      await navigate({ to: "/sessions/$id", params: { id: session.id } });
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <AppShell nav={<Nav />}>
      <PageHeader title="New session" />
      {!setup.ready ? (
        <Alert data-testid="setup-notice">
          <AlertTitle>Sessions can't start yet</AlertTitle>
          <AlertDescription>
            An admin needs to set up {setup.missing.join(", ")} on the Gateway.
          </AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={start} className="space-y-6">
        <Tabs value={mode} onValueChange={(next) => setMode(next as "agent" | "ask")}>
          <TabsList>
            <TabsTrigger value="agent" data-testid="mode-agent">
              Agent
            </TabsTrigger>
            <TabsTrigger value="ask" data-testid="mode-ask">
              Ask
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {mode === "agent"
            ? "The agent changes code, runs it and opens a pull request."
            : "The agent reads the code and answers. It changes nothing."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="repo">Repository</Label>
            {repos.length ? (
              <Picker
                id="repo"
                testId="repo-select"
                placeholder="Pick a repository"
                value={repoId}
                onChange={setRepoId}
                items={repos.map((repo) => ({ value: repo.id, label: repo.fullName }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No repositories yet. <Link to="/repos" className="text-primary underline-offset-4 hover:underline">Add one</Link>{" "}
                first.
              </p>
            )}
          </div>
          {mode === "agent" ? (
            <div className="space-y-2">
              <Label htmlFor="tier">Agent tier</Label>
              <Picker id="tier" testId="tier-select" value={tier} onChange={setTier} items={[...TIER_ITEMS]} />
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="prompt">{mode === "agent" ? "Task" : "Question"}</Label>
          <Textarea
            id="prompt"
            data-testid="prompt-input"
            rows={6}
            required
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={mode === "agent" ? "Fix the flaky checkout test" : "Where do we compute shipping costs?"}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="submit"
          data-testid="start-session"
          pending={pending}
          disabled={!setup.ready || !repos.length || !prompt.trim()}
        >
          {mode === "agent" ? "Start session" : "Ask"}
        </Button>
      </form>
    </AppShell>
  );
}
