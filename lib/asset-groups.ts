/**
 * Designer-defined content groups — see db/migrations/0003_add_asset_groups.sql
 * for the real problem this solves (same-size, different-content assets like
 * "MOX Invest-v1_*" vs "MOXPlus_*" getting silently mixed by the old
 * whole-job Gap Matrix). Manual only, never inferred from filenames.
 */
import { getPool, query } from "./db";

export interface AssetGroup {
  id: string;
  jobId: string;
  name: string;
  createdAt: string;
  assetIds: string[];
}

export async function listGroupsForJob(jobId: string): Promise<AssetGroup[]> {
  const groups = await query<{ id: string; jobId: string; name: string; createdAt: string }>(
    `select id, job_id as "jobId", name, created_at as "createdAt" from asset_groups where job_id = $1 order by created_at`,
    [jobId],
  );
  const members = await query<{ groupId: string; assetId: string }>(
    `select m.group_id as "groupId", m.asset_id as "assetId"
     from asset_group_members m join asset_groups g on g.id = m.group_id
     where g.job_id = $1`,
    [jobId],
  );
  const byGroup = new Map<string, string[]>();
  for (const m of members) {
    if (!byGroup.has(m.groupId)) byGroup.set(m.groupId, []);
    byGroup.get(m.groupId)!.push(m.assetId);
  }
  return groups.map((g) => ({ ...g, assetIds: byGroup.get(g.id) ?? [] }));
}

/** Assets in this job that aren't in any group yet — the Gap Matrix can't
 * say anything meaningful about them until the Designer assigns them,
 * per the "grouping is manual, never guessed" rule. */
export async function listUngroupedAssetIds(jobId: string): Promise<Set<string>> {
  const rows = await query<{ id: string }>(
    `select a.id from assets a
     where a.job_id = $1
       and not exists (select 1 from asset_group_members m where m.asset_id = a.id)`,
    [jobId],
  );
  return new Set(rows.map((r) => r.id));
}

export async function createGroup(jobId: string, name: string, assetIds: string[]): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const res = await client.query(`insert into asset_groups (job_id, name) values ($1, $2) returning id`, [jobId, name]);
    const groupId = res.rows[0].id as string;
    for (const assetId of assetIds) {
      await client.query(`insert into asset_group_members (group_id, asset_id) values ($1, $2)`, [groupId, assetId]);
    }
    await client.query("commit");
    return groupId;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  await query(`delete from asset_groups where id = $1`, [groupId]);
}
