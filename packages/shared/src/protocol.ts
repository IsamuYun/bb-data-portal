import { z } from "zod";
import { recipeSchema } from "./recipe";

/** Wire protocol between the Chrome extension and /api/ext/*. Device token goes in `Authorization: Bearer`. */
export const registerRequest = z.object({
  pairingCode: z.string().min(4),
  name: z.string().min(1).max(100),
  chromeVersion: z.string().optional(),
  extVersion: z.string().optional(),
});
export const registerResponse = z.object({ deviceId: z.string(), token: z.string(), name: z.string() });

export const heartbeatRequest = z.object({
  chromeVersion: z.string().optional(),
  extVersion: z.string().optional(),
  currentJobId: z.string().nullable().optional(),
});
export const heartbeatResponse = z.object({ ok: z.literal(true), status: z.enum(["active", "paused", "revoked"]), name: z.string() });

export const logEntry = z.object({ t: z.number(), level: z.enum(["info", "warn", "error"]), msg: z.string() });

export const nextJobResponse = z.object({
  job: z
    .object({
      id: z.string(),
      runId: z.string(),
      url: z.string(),
      externalId: z.string().nullable(),
      platformSlug: z.string(),
      seed: z.record(z.string(), z.unknown()).nullable(),
      leaseUntil: z.string(),
      attempt: z.number().int(),
    })
    .nullable(),
  recipe: recipeSchema.nullable(),
  /** Device is paused/revoked server-side: stop polling for a while. */
  deviceStatus: z.enum(["active", "paused", "revoked"]).default("active"),
});

export const jobResultRequest = z.object({
  runId: z.string().optional(),
  status: z.enum(["done", "failed", "auth_required", "skipped"]),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  logs: z.array(logEntry).default([]),
  recipeVersion: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  /** Media the extension intends to upload next (URL only; bytes come via /media). */
  mediaCount: z.number().int().nonnegative().optional(),
  /** Listing jobs: new jobs to create (same platform and dataset) instead of a record. */
  enqueue: z.array(z.object({ url: z.string().url(), externalId: z.string().min(1).max(200) })).max(50000).optional(),
});
export const jobResultResponse = z.object({ ok: z.literal(true), jobStatus: z.string(), recordId: z.string().nullable() });

/** multipart/form-data fields for POST /jobs/:id/media (plus `file`). */
export const mediaUploadFields = z.object({
  field: z.string().min(1),
  kind: z.enum(["photo", "audio", "doc", "screenshot"]).default("photo"),
  position: z.coerce.number().int().nonnegative().default(0),
  originalUrl: z.string().optional(),
});
export const mediaUploadResponse = z.object({ ok: z.literal(true), mediaId: z.string(), deduped: z.boolean() });

export const jobLogRequest = z.object({ runId: z.string().optional(), logs: z.array(logEntry).min(1) });

export type RegisterRequest = z.infer<typeof registerRequest>;
export type RegisterResponse = z.infer<typeof registerResponse>;
export type HeartbeatResponse = z.infer<typeof heartbeatResponse>;
export type NextJobResponse = z.infer<typeof nextJobResponse>;
export type JobResultRequest = z.infer<typeof jobResultRequest>;
export type JobResultResponse = z.infer<typeof jobResultResponse>;
export type MediaUploadResponse = z.infer<typeof mediaUploadResponse>;
