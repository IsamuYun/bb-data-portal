import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Recipe } from "@bb/shared";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const userRole = pgEnum("user_role", ["admin", "operator", "viewer"]);
export const deviceStatus = pgEnum("device_status", ["active", "paused", "revoked"]);
export const jobStatus = pgEnum("job_status", [
  "pending",
  "leased",
  "running",
  "done",
  "failed",
  "auth_required",
  "skipped",
  "cancelled",
]);
export const runStatus = pgEnum("run_status", ["running", "done", "failed", "auth_required", "skipped"]);
export const mediaKind = pgEnum("media_kind", ["photo", "audio", "doc", "screenshot"]);
export const exportType = pgEnum("export_type", ["xlsx", "pdf"]);
export const exportStatus = pgEnum("export_status", ["pending", "running", "done", "failed"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("admin"),
  createdAt: createdAt(),
});

/** A field template tells the UI/exports which columns a platform produces. */
export type FieldSchema = { key: string; label: string; type: "string" | "number" | "string[]" | "text" | "url" }[];

export const platforms = pgTable("platforms", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  fieldSchema: jsonb("field_schema").$type<FieldSchema>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recipes = pgTable(
  "recipes",
  {
    id: id(),
    platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    json: jsonb("json").$type<Recipe>().notNull(),
    isActive: boolean("is_active").notNull().default(false),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("recipes_platform_version_uq").on(t.platformId, t.version)],
);

export const devices = pgTable("devices", {
  id: id(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: deviceStatus("status").notNull().default("active"),
  chromeVersion: text("chrome_version"),
  extVersion: text("ext_version"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  currentJobId: uuid("current_job_id"),
  createdAt: createdAt(),
});

export const pairingCodes = pgTable("pairing_codes", {
  id: id(),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByDeviceId: uuid("used_by_device_id").references(() => devices.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const datasets = pgTable("datasets", {
  id: id(),
  platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceFile: text("source_file"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    datasetId: uuid("dataset_id").references(() => datasets.id, { onDelete: "cascade" }),
    platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    externalId: text("external_id"),
    /** Columns from the import file that are not the URL/ID (kept as provenance). */
    seed: jsonb("seed").$type<Record<string, unknown>>(),
    status: jobStatus("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leasedBy: uuid("leased_by").references(() => devices.id, { onDelete: "set null" }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_status_priority_idx").on(t.status, t.priority, t.createdAt),
    index("jobs_platform_external_idx").on(t.platformId, t.externalId),
  ],
);

export const jobRuns = pgTable("job_runs", {
  id: id(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  recipeVersion: integer("recipe_version"),
  status: runStatus("status").notNull().default("running"),
  error: text("error"),
  output: jsonb("output").$type<Record<string, unknown>>(),
  logs: jsonb("logs").$type<{ t: number; level: string; msg: string }[]>(),
  screenshotPath: text("screenshot_path"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const records = pgTable(
  "records",
  {
    id: id(),
    platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    version: integer("version").notNull().default(1),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    sourceUrl: text("source_url").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("records_platform_external_uq").on(t.platformId, t.externalId)],
);

export const media = pgTable(
  "media",
  {
    id: id(),
    recordId: uuid("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull().default("photo"),
    /** Path relative to MEDIA_DIR. */
    path: text("path").notNull(),
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalUrl: text("original_url"),
    fieldKey: text("field_key"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("media_sha_idx").on(t.sha256), index("media_record_idx").on(t.recordId)],
);

export const exports = pgTable("exports", {
  id: id(),
  type: exportType("type").notNull(),
  platformId: uuid("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  status: exportStatus("status").notNull().default("pending"),
  filePath: text("file_path"),
  rowCount: integer("row_count"),
  error: text("error"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const platformsRelations = relations(platforms, ({ many }) => ({
  recipes: many(recipes),
  jobs: many(jobs),
  records: many(records),
}));
export const recipesRelations = relations(recipes, ({ one }) => ({
  platform: one(platforms, { fields: [recipes.platformId], references: [platforms.id] }),
}));
export const jobsRelations = relations(jobs, ({ one, many }) => ({
  platform: one(platforms, { fields: [jobs.platformId], references: [platforms.id] }),
  dataset: one(datasets, { fields: [jobs.datasetId], references: [datasets.id] }),
  device: one(devices, { fields: [jobs.leasedBy], references: [devices.id] }),
  runs: many(jobRuns),
}));
export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
  job: one(jobs, { fields: [jobRuns.jobId], references: [jobs.id] }),
}));
export const recordsRelations = relations(records, ({ one, many }) => ({
  platform: one(platforms, { fields: [records.platformId], references: [platforms.id] }),
  media: many(media),
}));
export const mediaRelations = relations(media, ({ one }) => ({
  record: one(records, { fields: [media.recordId], references: [records.id] }),
}));

export const now = sql`now()`;
