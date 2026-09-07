/**
 * Controlled industry list — see db/migrations/0001_add_industries.sql for
 * why this exists (backs both the Job Create dropdown and Prompt Lab's
 * per-industry organization; free text would fragment the same industry
 * into multiple spellings across jobs/prompts).
 */
import { query } from "./db";

export interface Industry {
  id: string;
  name: string;
}

export async function listIndustries(): Promise<Industry[]> {
  return query<Industry>(`select id, name from industries order by name`);
}
