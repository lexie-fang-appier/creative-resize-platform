import Link from "next/link";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  scanning: "bg-sky-100 text-sky-700",
  scanned: "bg-sky-100 text-sky-700",
  scan_error: "bg-red-100 text-red-700",
  gap_analyzed: "bg-indigo-100 text-indigo-700",
  routed: "bg-violet-100 text-violet-700",
  processing: "bg-amber-100 text-amber-700",
  review_pending: "bg-amber-100 text-amber-700",
  partially_approved: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <main className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">Creative resize / redesign jobs, newest first.</p>
        </div>
        <Link
          href="/jobs/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
        >
          + New Job
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Ad Solution / Channel / Format</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:text-slate-600 hover:underline">
                    {j.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {j.adSolution} / {j.channel} / {j.creativeFormat}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={j.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                  No jobs yet — create one to scan a client Drive folder.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
