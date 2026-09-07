import { listPlacements } from "@/lib/specs";
import NewJobForm from "./NewJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const placements = await listPlacements();

  return (
    <main className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Job</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Scans the Drive folder, then computes Coverage &amp; Gap Matrix + routing for the selected target placements.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <NewJobForm placements={placements} />
      </div>
    </main>
  );
}
