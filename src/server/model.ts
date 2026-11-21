import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
} from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { callFor } from "./callFor";
import { HttpError } from "./access";
import { SetupNeeded } from "./github";

export const TIERS = {
  lite: { label: "Lite", model: "openai/gpt-5-mini" },
  normal: { label: "Normal", model: "anthropic/claude-sonnet-4.5" },
  ultra: { label: "Ultra", model: "anthropic/claude-opus-4.1" },
} as const;
export type Tier = keyof typeof TIERS;

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function completionsUrl(): string {
  return `${aiBaseUrl("openrouter")}/chat/completions`;
}

export async function chat(
  tier: Tier,
  messages: ChatMessage[],
  tools: ToolSpec[],
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const fetchModel = createGatewayFetch({ env, ...callFor() });
  const response = await fetchModel(completionsUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: TIERS[tier].model,
      messages,
      tools: tools.map((tool) => ({ type: "function", function: tool })),
      tool_choice: "required",
    }),
  });
  if (await gatewayRefusal(response)) throw new SetupNeeded("A model");
  if (!response.ok) {
    throw new HttpError(502, `The model answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as {
    choices?: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
  };
  const message = body.choices?.[0]?.message;
  if (!message) throw new HttpError(502, "The model gave no answer.");
  return { content: message.content, toolCalls: message.tool_calls ?? [] };
}

/** Whether a model is reachable, without paying for a completion. */
export async function modelReady(): Promise<boolean> {
  try {
    const fetchModel = createGatewayFetch({ env, ...callFor() });
    const response = await fetchModel(completionsUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: TIERS.lite.model, messages: [] }),
    });
    return !(await gatewayRefusal(response));
  } catch {
    return false;
  }
}
