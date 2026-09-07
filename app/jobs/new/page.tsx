import { listPlacements } from "@/lib/specs";
import NewJobForm from "./NewJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const placements = await listPlacements();

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">New Job</h1>
      <p className="text-sm text-slate-500 mb-6">
        Scans the Drive folder, then computes Coverage &amp; Gap Matrix + routing for the selected target placements.
      </p>
      <NewJobForm placements={placements} />
    </main>
  );
}
