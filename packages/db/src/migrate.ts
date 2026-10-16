import { readFile } from "node:fs/promises";
import { pool } from "./index.js";
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(812483)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)",
  );
  const done = await client.query(
    "SELECT 1 FROM schema_migrations WHERE version=$1",
    ["001"],
  );
  if (!done.rowCount) {
    await client.query(
      await readFile(
        new URL("../migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    await client.query("INSERT INTO schema_migrations VALUES ($1)", ["001"]);
  }
  await client.query("COMMIT");
  console.log("Database migrations applied.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
