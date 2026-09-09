"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Nav from "./Nav";

/** Client-side gate mirroring ai-tool-hub's HubLayout pattern — same company,
 * same SSO requirement. Real enforcement is server-side (see
 * lib/require-session.ts); this just keeps a signed-out user from seeing the
 * UI (or the Nav bar) flash before the redirect. /login renders its own
 * standalone page with no Nav, and is exempt from the redirect loop. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      router.replace("/login");
    }
  }, [status, pathname, router]);

  if (pathname === "/login") return <>{children}</>;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  if (status !== "authenticated") return null;

  return (
    <>
      <Nav />
      {children}
    </>
  );
}
