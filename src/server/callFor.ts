import { AsyncLocalStorage } from "node:async_hooks";

// Brokered calls made by the agent loop belong to no request: they run
// from the queue as the organization's background work.
const background = new AsyncLocalStorage<true>();

export function inBackground<T>(work: () => Promise<T>): Promise<T> {
  return background.run(true, work);
}

/** `for` for a Gateway call: the request's by default, the organization's from the queue. */
export function callFor(): { for?: { background: true } } {
  return background.getStore() ? { for: { background: true } } : {};
}
