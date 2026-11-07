import { and, eq, inArray, jobs, type Db } from "@bb/db";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type ListingJob = { id: string; platformId: string; datasetId: string | null };

const CHUNK = 500;

/**
 * Create detail jobs from a listing run, in the listing job's dataset. An externalId that already has a job on the
 * platform (any status) is skipped, like the spreadsheet import's "skip existing": re-collecting is done from the
 * jobs page instead of by duplicating jobs.
 */
export async function enqueueFromListing(tx: Tx, job: ListingJob, items: { url: string; externalId: string }[]) {
  const unique = [...new Map(items.map((i) => [i.externalId, i])).values()];
  const existing = new Set<string>();
  for (let i = 0; i < unique.length; i += CHUNK) {
    const ids = unique.slice(i, i + CHUNK).map((u) => u.externalId);
    const rows = await tx.select({ externalId: jobs.externalId }).from(jobs).where(and(eq(jobs.platformId, job.platformId), inArray(jobs.externalId, ids)));
    for (const r of rows) if (r.externalId) existing.add(r.externalId);
  }
  const fresh = unique.filter((u) => !existing.has(u.externalId));
  for (let i = 0; i < fresh.length; i += CHUNK) {
    await tx.insert(jobs).values(
      fresh.slice(i, i + CHUNK).map((u) => ({ datasetId: job.datasetId, platformId: job.platformId, url: u.url, externalId: u.externalId, seed: { listingJobId: job.id } })),
    );
  }
  return { created: fresh.length, skipped: items.length - fresh.length };
}
