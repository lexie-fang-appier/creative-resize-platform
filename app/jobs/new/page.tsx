import { listIndustries } from "@/lib/industries";
import { listPlacements } from "@/lib/specs";
import NewJobForm from "./NewJobForm";
import { getDriveServiceAccountEmail } from "@/lib/drive";
import { requireSessionEmail } from "@/lib/require-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const sessionEmail = await requireSessionEmail().catch(() => null);
  if (!sessionEmail) redirect("/login");
  const [placements, industries] = await Promise.all([listPlacements(), listIndustries()]);

  return (
    <main className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Job</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Quickly lists Drive metadata first. The selected source is downloaded and analyzed in the next step.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <NewJobForm placements={placements} industries={industries} driveAccountEmail={getDriveServiceAccountEmail()} />
      </div>
    </main>
  );
}
