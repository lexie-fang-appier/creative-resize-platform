import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/** Every server action that writes data calls this first — the client-side
 * gate in app/AuthGate.tsx keeps the normal UI behind sign-in, but a Server
 * Action is a public POST endpoint regardless, so this is the real boundary,
 * not just UX. Throws (rather than returning null) since a server action has
 * no clean way to redirect mid-mutation — the write simply doesn't happen. */
export async function requireSessionEmail(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("Not signed in.");
  }
  return session.user.email;
}
