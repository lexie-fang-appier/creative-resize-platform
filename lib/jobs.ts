/**
 * `jobs` / `job_target_placements` / `clients` data access + the Job state
 * machine from 28 Technical Plan §11:
 *
 *   draft -> scanning -> scanned | scan_error
 *   scanned -> gap_analyzed -> routed
 *   (routed -> processing -> ... is Phase 2+, out of scope here)
 *
 * A plain status-column update is enough for Phase 1 (no formal state-machine
 * library) — `updateJobStatus` doesn't validate the transition graph, callers
 * are expected to call it in the right order (see app/jobs/new/actions.ts).
 */
import { query } from "./db";
import { logNewJob } from "./sheets-log";

export type JobStatus =
  | "draft"
  | "scanning"
  | "scanned"
  | "scan_error"
  | "gap_analyzed"
  | "routed";

export interface Job {
  id: string;
  clientId: string;
  clientName: string;
  clientIndustry: string | null;
  driveFolderUrl: string;
  driveFolderId: string;
  adSolution: string;
  channel: string;
  creativeFormat: string;
  campaignInstruction: string | null;
  status: JobStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobTargetPlacement {
  id: string;
  jobId: string;
  placement: string;
  status: string;
}

export interface CreateJobInput {
  clientName: string;
  industry: string | null;
  driveFolderUrl: string;
  driveFolderId: string;
  adSolution: string;
  channel: string;
  creativeFormat: string;
  campaignInstruction: string | null;
  targetPlacements: string[]; // placement text values, e.g. ["Banner", "Native"]
  createdBy: string;
}

async function findOrCreateClient(name: string, industry: string | null): Promise<string> {
  const existing = await query<{ id: string }>(`select id from clients where name = $1 limit 1`, [name]);
  if (existing.length > 0) return existing[0].id;
  const created = await query<{ id: string }>(
    `insert into clients (name, industry) values ($1, $2) returning id`,
    [name, industry],
  );
  return created[0].id;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const clientId = await findOrCreateClient(input.clientName, input.industry);

  const [job] = await query<{
    id: string; client_id: string; drive_folder_url: string; drive_folder_id: string;
    ad_solution: string; channel: string; creative_format: string; campaign_instruction: string | null;
    status: JobStatus; created_by: string; created_at: string; updated_at: string;
  }>(
    `insert into jobs
       (client_id, drive_folder_url, drive_folder_id, ad_solution, channel, creative_format,
        campaign_instruction, status, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
     returning *`,
    [
      clientId,
      input.driveFolderUrl,
      input.driveFolderId,
      input.adSolution,
      input.channel,
      input.creativeFormat,
      input.campaignInstruction,
      input.createdBy,
    ],
  );

  for (const placement of input.targetPlacements) {
    await query(`insert into job_target_placements (job_id, placement) values ($1, $2)`, [job.id, placement]);
  }

  const full = await getJob(job.id);
  if (!full) throw new Error("createJob: failed to read back the row that was just inserted");

  await logNewJob({
    jobId: full.id,
    clientName: full.clientName,
    industry: full.clientIndustry,
    driveFolderUrl: full.driveFolderUrl,
    adSolution: full.adSolution,
    channel: full.channel,
    creativeFormat: full.creativeFormat,
    campaignInstruction: full.campaignInstruction,
    targetPlacements: input.targetPlacements,
    createdBy: full.createdBy,
  });

  return full;
}

export async function addTargetPlacements(jobId: string, placements: string[]): Promise<void> {
  for (const placement of placements) {
    await query(`insert into job_target_placements (job_id, placement) values ($1, $2)`, [jobId, placement]);
  }
}

export async function getJob(id: string): Promise<Job | null> {
  const rows = await query<Job>(
    `select j.id, j.client_id as "clientId", c.name as "clientName", c.industry as "clientIndustry",
            j.drive_folder_url as "driveFolderUrl", j.drive_folder_id as "driveFolderId",
            j.ad_solution as "adSolution", j.channel, j.creative_format as "creativeFormat",
            j.campaign_instruction as "campaignInstruction", j.status,
            j.created_by as "createdBy", j.created_at as "createdAt", j.updated_at as "updatedAt"
     from jobs j
     join clients c on c.id = j.client_id
     where j.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listJobs(): Promise<Job[]> {
  return query<Job>(
    `select j.id, j.client_id as "clientId", c.name as "clientName", c.industry as "clientIndustry",
            j.drive_folder_url as "driveFolderUrl", j.drive_folder_id as "driveFolderId",
            j.ad_solution as "adSolution", j.channel, j.creative_format as "creativeFormat",
            j.campaign_instruction as "campaignInstruction", j.status,
            j.created_by as "createdBy", j.created_at as "createdAt", j.updated_at as "updatedAt"
     from jobs j
     join clients c on c.id = j.client_id
     order by j.created_at desc`,
  );
}

export async function listTargetPlacements(jobId: string): Promise<JobTargetPlacement[]> {
  return query<JobTargetPlacement>(
    `select id, job_id as "jobId", placement, status from job_target_placements where job_id = $1 order by placement`,
    [jobId],
  );
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<void> {
  await query(`update jobs set status = $2, updated_at = now() where id = $1`, [id, status]);
}
