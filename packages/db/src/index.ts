import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../../shared/src/config.js";
import * as schema from "./schema.js";
export * from "./schema.js";
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});
export const db = drizzle(pool, { schema });
export { eq, and, desc, sql, isNull } from "drizzle-orm";
export async function audit(incidentId: string, stage: string, detail: string) {
  await db
    .insert(schema.audits)
    .values({ incidentId, stage, detail })
    .onConflictDoNothing();
}
