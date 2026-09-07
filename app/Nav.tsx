"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/jobs/new", label: "New Job" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-8 py-3.5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-900 text-[11px] font-bold text-white">
            CR
          </span>
          Creative Resize
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || (l.href === "/jobs" && pathname?.startsWith("/jobs/") && pathname !== "/jobs/new");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          Phase 1 · internal preview
        </span>
      </div>
    </header>
  );
}
