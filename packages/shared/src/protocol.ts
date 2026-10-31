import { z } from "zod";
import { recipeSchema } from "./recipe";

/** Wire protocol between the Chrome extension and /api/ext/*. */
export const registerRequest = z.object({
  pairingCode: z.string().min(4),
  name: z.string().min(1).max(100),
  chromeVersion: z.string().optional(),
  extVersion: z.string().optional(),
});
export const registerResponse = z.object({ deviceId: z.string(), token: z.string() });

export const heartbeatRequest = z.object({
  chromeVersion: z.string().optional(),
  extVersion: z.string().optional(),
  currentJobId: z.string().nullable().optional(),
});

export const nextJobResponse = z.object({
  job: z
    .object({
      id: z.string(),
      url: z.string(),
      externalId: z.string().nullable(),
      platformSlug: z.string(),
      seed: z.record(z.string(), z.unknown()).nullable(),
      leaseUntil: z.string(),
    })
    .nullable(),
  recipe: recipeSchema.nullable(),
});

export const jobResultRequest = z.object({
  status: z.enum(["done", "failed", "auth_required", "skipped"]),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  logs: z.array(z.object({ t: z.number(), level: z.enum(["info", "warn", "error"]), msg: z.string() })).default([]),
  recipeVersion: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export type RegisterRequest = z.infer<typeof registerRequest>;
export type NextJobResponse = z.infer<typeof nextJobResponse>;
export type JobResultRequest = z.infer<typeof jobResultRequest>;
