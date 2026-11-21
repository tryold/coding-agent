import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "coding-agent",
  name: "Coding Agent",
  icon: "/icon.svg",
  description:
    "An AI agent that answers questions about your GitHub repositories and works on them in a cloud sandbox until it can open a pull request.",
  resources: {
    d1: ["DB"],
    queues: [
      {
        name: "AGENT_RUNS",
        consumer: { maxBatchSize: 1, maxBatchTimeout: 1, maxRetries: 0 },
      },
    ],
  },
  providers: [
    {
      id: "openrouter",
      why: "The model behind each agent tier.",
      docs: "https://openrouter.ai/settings/keys",
    },
  ],
  capabilities: {
    github: {
      access: "write",
      why: "Checks repositories, downloads their code, pushes the agent's branches and opens pull requests.",
      docs: "https://github.com/settings/personal-access-tokens",
    },
    daytona: {
      access: "write",
      why: "The sandbox each session's agent reads, edits and runs code in.",
      docs: "https://app.daytona.io/dashboard/keys",
    },
  },
  features: {
    agent: {
      name: "Agent",
      why: "Starts sessions: a model, a sandbox and GitHub.",
      steps: [
        "Add an OpenRouter key: `everyapp provider add openrouter`.",
        "Add a Daytona key: `everyapp provider add daytona`.",
        "Add a GitHub fine-grained token with Contents and Pull requests read and write on the repositories: `everyapp provider add github`.",
      ],
      providers: ["openrouter"],
      capabilities: ["github", "daytona"],
    },
  },
});
