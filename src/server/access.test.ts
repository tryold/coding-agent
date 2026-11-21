import { describe, expect, it } from "vitest";
import {
  canEditKnowledge,
  canManage,
  canMessage,
  canRead,
  knowledgeApplies,
  type Actor,
} from "./access";

const owner: Actor = { id: "u1", email: "a@x.test", admin: false };
const other: Actor = { id: "u2", email: "b@x.test", admin: false };
const admin: Actor = { id: "u3", email: "c@x.test", admin: true };

describe("sessions", () => {
  const privateOne = { ownerId: "u1", visibility: "private" as const, collaborate: false };
  const shared = { ownerId: "u1", visibility: "org" as const, collaborate: false };
  const open = { ownerId: "u1", visibility: "org" as const, collaborate: true };

  it("keeps a private session to its owner and admins", () => {
    expect(canRead(privateOne, owner)).toBe(true);
    expect(canRead(privateOne, other)).toBe(false);
    expect(canRead(privateOne, admin)).toBe(true);
  });

  it("lets members read shared sessions and message only when collaboration is on", () => {
    expect(canRead(shared, other)).toBe(true);
    expect(canMessage(shared, other)).toBe(false);
    expect(canMessage(open, other)).toBe(true);
    expect(canMessage(privateOne, owner)).toBe(true);
  });

  it("leaves stop, delete and sharing to the owner or an admin", () => {
    expect(canManage(open, other)).toBe(false);
    expect(canManage(open, owner)).toBe(true);
    expect(canManage(open, admin)).toBe(true);
  });
});

describe("knowledge", () => {
  it("is edited by its author or an admin", () => {
    expect(canEditKnowledge({ authorId: "u1" }, owner)).toBe(true);
    expect(canEditKnowledge({ authorId: "u1" }, other)).toBe(false);
    expect(canEditKnowledge({ authorId: "u1" }, admin)).toBe(true);
  });

  it("applies when enabled and unscoped or scoped to the repo", () => {
    expect(knowledgeApplies({ enabled: true, repoId: null }, "r1")).toBe(true);
    expect(knowledgeApplies({ enabled: true, repoId: "r1" }, "r1")).toBe(true);
    expect(knowledgeApplies({ enabled: true, repoId: "r2" }, "r1")).toBe(false);
    expect(knowledgeApplies({ enabled: false, repoId: null }, "r1")).toBe(false);
  });
});
