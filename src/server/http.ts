import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { HttpError, type Actor } from "./access";
import { actorFor } from "./actor";

/** A JSON route's answer: the member from the Gateway's identity, errors as statuses. */
export async function respond(
  request: Request,
  work: (actor: Actor, body: unknown) => Promise<unknown>,
  status = 200,
): Promise<Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    let body: unknown = {};
    if (request.method !== "GET" && request.method !== "DELETE" && request.method !== "HEAD") {
      const type = request.headers.get("content-type");
      if (type && !type.includes("application/json")) {
        return Response.json({ error: "Send JSON." }, { status: 415 });
      }
      if (type) body = await request.json();
    }
    return Response.json(await work(await actorFor(user), body), { status });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    throw error;
  }
}

export const queryOf = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);
