import { GitPullRequest } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";

export const STATUS_LABELS = {
  queued: "Queued",
  working: "Working",
  waiting: "Waiting for you",
  finished: "Finished",
  failed: "Failed",
  stopped: "Stopped",
} as const;
export type Status = keyof typeof STATUS_LABELS;

const STATUS_VARIANTS = {
  queued: "secondary",
  working: "info",
  waiting: "warning",
  finished: "success",
  failed: "destructive",
  stopped: "outline",
} as const;

export function StatusBadge({ status, testId }: { status: Status; testId?: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} data-testid={testId}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const PR_LABELS = { open: "Open", merged: "Merged", closed: "Closed" } as const;
const PR_VARIANTS = { open: "success", merged: "info", closed: "outline" } as const;

export function PullBadge({ number, state }: { number: number; state: keyof typeof PR_LABELS }) {
  return (
    <Badge variant={PR_VARIANTS[state]} data-testid="pr-badge">
      <GitPullRequest aria-hidden />#{number} {PR_LABELS[state]}
    </Badge>
  );
}

export function pullLabel(state: keyof typeof PR_LABELS) {
  return PR_LABELS[state];
}

/** "5 min ago" from a D1 timestamp (UTC, "YYYY-MM-DD HH:MM:SS"). */
export function timeAgo(value: string, now = Date.now()): string {
  const at = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "That didn't work.";
}

export const TIER_ITEMS = [
  { value: "lite", label: "Lite" },
  { value: "normal", label: "Normal" },
  { value: "ultra", label: "Ultra" },
] as const;
export type Tier = (typeof TIER_ITEMS)[number]["value"];
