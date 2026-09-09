"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function LoginContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-slate-900 text-sm font-bold text-white">
          CR
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">Creative Resize Platform</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your Appier Google account to continue.</p>

        {error === "AccessDenied" && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-left text-xs leading-5 text-red-800">
            Access restricted to <strong>@appier.com</strong> accounts only. Please sign in with your Appier Google
            Workspace email.
          </div>
        )}
        {error && error !== "AccessDenied" && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-left text-xs leading-5 text-red-800">
            Sign-in error: {error}. Please try again.
          </div>
        )}

        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-shadow hover:shadow-md"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.2z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.7v6.2C6.7 42.8 14.8 48 24 48z" />
            <path fill="#FBBC05" d="M10.8 28.8c-.5-1.4-.7-2.9-.7-4.8s.3-3.3.7-4.8v-6.2H2.7C1 16.4 0 20.1 0 24s1 7.6 2.7 10.9l8.1-6.1z" />
            <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.8 0 6.7 5.2 2.7 13.1l8.1 6.2C12.7 13.6 17.9 9.5 24 9.5z" />
          </svg>
          Sign in with Google
        </button>

        <p className="mt-5 text-xs text-slate-400">Only @appier.com accounts are permitted.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
