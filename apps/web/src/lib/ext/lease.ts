import { db, devices, eq, jobRuns, jobs, platforms, recipes, sql } from "@bb/db";
import type { NextJobResponse } from "@bb/shared";

export const LEASE_MINUTES = 10;

/**
 * Atomically lease one pending job for a device. Expired leases are reclaimed first.
 * Postgres `FOR UPDATE SKIP LOCKED` makes this safe for several devices polling at once.
 */
export async function leaseNextJob(deviceId: string, platformSlugs?: string[]): Promise<NextJobResponse["job"] & { recipe: NextJobResponse["recipe"] } | null> {
  const d = db();
  await d.execute(sql`
    update ${jobs} set status = 'pending', leased_by = null, lease_until = null,
      last_error = coalesce(last_error, '') || ' [lease expired]'
    where status in ('leased','running') and lease_until < now()`);

  return d.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      select j.id, j.url, j.external_id, j.seed, j.attempts, p.slug, r.json as recipe, r.version
      from ${jobs} j
      join ${platforms} p on p.id = j.platform_id and p.enabled
      join ${recipes} r on r.platform_id = p.id and r.is_active
      where j.status = 'pending' and j.attempts < j.max_attempts
        ${platformSlugs?.length ? sql`and p.slug in ${platformSlugs}` : sql``}
      order by j.priority desc, j.created_at asc
      limit 1
      for update of j skip locked`);
    const row = rows[0] as
      | { id: string; url: string; external_id: string | null; seed: Record<string, unknown> | null; attempts: number; slug: string; recipe: NextJobResponse["recipe"]; version: number }
      | undefined;
    if (!row) return null;
    const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60_000);
    await tx
      .update(jobs)
      .set({ status: "leased", leasedBy: deviceId, leaseUntil, attempts: row.attempts + 1, lastError: null })
      .where(eq(jobs.id, row.id));
    const [run] = await tx.insert(jobRuns).values({ jobId: row.id, deviceId, recipeVersion: row.version, status: "running" }).returning({ id: jobRuns.id });
    await tx.update(devices).set({ currentJobId: row.id }).where(eq(devices.id, deviceId));
    return {
      id: row.id,
      runId: run.id,
      url: row.url,
      externalId: row.external_id,
      platformSlug: row.slug,
      seed: row.seed,
      leaseUntil: leaseUntil.toISOString(),
      attempt: row.attempts + 1,
      recipe: row.recipe,
    };
  });
}
