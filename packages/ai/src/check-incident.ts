import { investigate } from "./index.js";
import { pool } from "@flowmedic/db";
const id = process.argv[2];
if (!id) throw Error("Usage: check-incident.ts <incident-id>");
try {
  console.log(JSON.stringify(await investigate(id), null, 2));
} finally {
  await pool.end();
}
