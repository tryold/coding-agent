import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Actor } from "./access";

/** The app's record of the person, made on first sight; email from the identity. */
export async function actorFor(user: EveryAppUser): Promise<Actor> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}
