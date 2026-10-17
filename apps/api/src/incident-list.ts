import { z } from "zod";
import { category } from "@flowmedic/shared";
import { db, incidents, and, desc, eq, sql } from "@flowmedic/db";

export const incidentListQuery = z
  .object({
    q: z.string().trim().max(200).default(""),
    status: z
      .enum([
        "RECEIVED",
        "INVESTIGATING",
        "AWAITING_APPROVAL",
        "RECOVERY_RUNNING",
        "RECOVERED",
        "REJECTED",
        "MANUAL_ACTION_REQUIRED",
        "FAILED",
      ])
      .optional(),
    category: category.optional(),
    mode: z.enum(["demo", "live"]).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export async function listIncidents(input: unknown) {
  const query = incidentListQuery.parse(input);
  // Search is a literal substring, including %, _ and backslashes, never a SQL pattern.
  const pattern = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    query.status ? eq(incidents.status, query.status) : undefined,
    query.category ? eq(incidents.category, query.category) : undefined,
    query.mode ? eq(incidents.mode, query.mode) : undefined,
    query.q
      ? sql`(${incidents.workflowName} ILIKE ${pattern} OR ${incidents.failedNode} ILIKE ${pattern} OR ${incidents.message} ILIKE ${pattern} OR ${incidents.id}::text ILIKE ${pattern})`
      : undefined,
  );
  // One snapshot keeps the count and rows consistent when ingestion is concurrent.
  return db.transaction(
    async (tx) => {
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(incidents)
        .where(where);
      const total = count!.total;
      const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
      const page = Math.min(query.page, totalPages);
      const items = await tx
        .select({
          id: incidents.id,
          integrationId: incidents.integrationId,
          workflowName: incidents.workflowName,
          failedNode: incidents.failedNode,
          message: incidents.message,
          status: incidents.status,
          category: incidents.category,
          severity: incidents.severity,
          mode: incidents.mode,
          createdAt: incidents.createdAt,
        })
        .from(incidents)
        .where(where)
        .orderBy(desc(incidents.createdAt), desc(incidents.id))
        .limit(query.pageSize)
        .offset((page - 1) * query.pageSize);
      return { items, total, page, pageSize: query.pageSize, totalPages };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
