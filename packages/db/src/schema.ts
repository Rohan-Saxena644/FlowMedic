import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  uniqueIndex,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import type { Diagnosis } from "@flowmedic/shared";
export const integrations = pgTable("integrations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  secretHash: text("secret_hash").notNull().unique(),
  mode: text().notNull().default("live"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const workflows = pgTable(
  "workflow_definitions",
  {
    id: uuid().primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    sourceId: text("source_id").notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("workflow_source").on(t.integrationId, t.sourceId)],
);
export const incidents = pgTable(
  "incidents",
  {
    id: uuid().primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id),
    sourceIdentity: text("source_identity").notNull(),
    workflowName: text("workflow_name").notNull(),
    executionId: text("execution_id"),
    executionUrl: text("execution_url"),
    failedNode: text("failed_node").notNull(),
    message: text().notNull(),
    status: text().notNull().default("RECEIVED"),
    category: text().notNull().default("UNKNOWN"),
    severity: text().notNull().default("medium"),
    mode: text().notNull(),
    evidence: jsonb().notNull(),
    diagnosis: jsonb().$type<Diagnosis>(),
    error: text(),
    scheduled: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("incident_delivery").on(t.integrationId, t.sourceIdentity),
  ],
);
export const runs = pgTable("investigation_runs", {
  id: uuid().primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .unique()
    .references(() => incidents.id),
  model: text().notNull(),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const evidence = pgTable(
  "investigation_evidence",
  {
    id: uuid().primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id),
    ref: text().notNull(),
    data: jsonb().notNull(),
  },
  (t) => [uniqueIndex("incident_evidence_ref").on(t.incidentId, t.ref)],
);
export const proposals = pgTable("recovery_proposals", {
  id: uuid().primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .unique()
    .references(() => incidents.id),
  eligible: boolean().notNull(),
  reason: text().notNull(),
  delaySeconds: integer("delay_seconds").notNull(),
  decision: text(),
});
export const attempts = pgTable("recovery_attempts", {
  id: uuid().primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .unique()
    .references(() => incidents.id),
  mode: text().notNull(),
  outcome: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const audits = pgTable(
  "audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id),
    stage: text().notNull(),
    detail: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("incident_stage").on(t.incidentId, t.stage)],
);
