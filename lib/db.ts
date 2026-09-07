import { Pool } from "pg";

// Thin connection-pool wrapper. Deliberately NOT an ORM (no Prisma/Drizzle) —
// matches the rest of Lexie's stack, which hand-writes SQL. See README for
// the Postgres-vs-Sheets divergence from ai-tool-hub's lib/sheets.ts.
//
// Reused across hot-reloads in dev by stashing the pool on `globalThis`,
// same trick every Next.js + pg example uses to avoid exhausting connections.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return global.__pgPool;
}

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}
