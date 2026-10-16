import { buildApp } from "./app.js";
import { db, incidents, proposals, eq, and, sql } from "@flowmedic/db";
import { config } from "../../../packages/shared/src/config.js";
import { schedule, temporal } from "./ingest.js";
const app = buildApp();
let dispatching = false;
const dispatch = async () => {
  if (dispatching) return;
  dispatching = true;
  try {
    const pending = await db
      .select()
      .from(incidents)
      .where(eq(incidents.scheduled, false))
      .limit(25);
    for (const i of pending) await schedule(i.id);
    const decisions = await db
      .select({ incidentId: proposals.incidentId })
      .from(proposals)
      .innerJoin(incidents, eq(proposals.incidentId, incidents.id))
      .where(
        and(
          sql`${proposals.decision} IS NOT NULL`,
          sql`${incidents.status} IN ('AWAITING_APPROVAL','RECOVERY_RUNNING')`,
        ),
      )
      .limit(25);
    for (const p of decisions)
      await (
        await temporal()
      ).workflow
        .getHandle(`investigation-${p.incidentId}`)
        .signal("decision");
  } catch (e) {
    app.log.warn(
      { name: e instanceof Error ? e.name : "unknown" },
      "Durable dispatcher will retry",
    );
  } finally {
    dispatching = false;
  }
};
const timer = setInterval(dispatch, 5000);
timer.unref();
await app.listen({ port: config.PORT, host: "127.0.0.1" });
void dispatch();
