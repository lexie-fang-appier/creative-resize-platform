import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Internal · Designer workbench</p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Creative Resize Platform</h1>
      <p className="mt-4 text-[15px] leading-7 text-slate-600">
        Scans client Google Drive folders, computes must-have size coverage against versioned specs, and routes each
        gap to deterministic or OpenAI-assisted resize with Designer review.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Phase 0", detail: "DB schema, ported classify/gap logic", done: true },
          { label: "Phase 1", detail: "Job Create, scan, Gap Matrix, routing", done: true },
          { label: "Phase 2", detail: "Deterministic execution", done: false },
        ].map((p) => (
          <div key={p.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${p.done ? "bg-emerald-500" : "bg-slate-300"}`}
                aria-hidden
              />
              <span className="text-sm font-semibold text-slate-900">{p.label}</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">{p.detail}</p>
          </div>
        ))}
      </div>

      <Link
        href="/jobs/new"
        className="mt-8 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
      >
        New Job
        <span aria-hidden>→</span>
      </Link>

      <p className="mt-10 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-400">
        Source of truth (local file, not a live link):
        <br />
        <code className="font-mono">
          Obsidian Vault/02 - Work/Creative Asset Automation/28 Technical Plan - Designer Creative Resize
          Platform.md
        </code>
      </p>
    </main>
  );
}
