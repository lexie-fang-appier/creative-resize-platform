import Link from "next/link";
import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Creative resize / redesign jobs, newest first.</p>
        </div>
        <Link
          href="/jobs/new"
          className="rounded bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700"
        >
          New Job
        </Link>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="py-2 px-3 font-medium">Client</th>
              <th className="py-2 px-3 font-medium">Ad Solution / Channel / Format</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 px-3">
                  <Link href={`/jobs/${j.id}`} className="text-blue-700 underline underline-offset-2">
                    {j.clientName}
                  </Link>
                </td>
                <td className="py-2 px-3 text-slate-700">
                  {j.adSolution} / {j.channel} / {j.creativeFormat}
                </td>
                <td className="py-2 px-3">
                  <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {j.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-slate-500">{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
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
