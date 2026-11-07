import { and, db, desc, eq, jobRuns, jobs, sql } from "@bb/db";
import { jobLogRequest } from "@bb/shared";
import { authDevice, fail, isResponse, json, parseBody } from "@/lib/ext/auth";

export const runtime = "nodejs";

/** Append log lines to the running job_run (for long jobs; the final logs come with /result). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const dev = await authDevice(req);
  if (isResponse(dev)) return dev;
  const body = await parseBody(req, jobLogRequest);
  if (isResponse(body)) return body;
  const { id } = await params;
  const d = db();
  const [job] = await d.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, id), eq(jobs.leasedBy, dev.id))).limit(1);
  if (!job) return fail("任务未由本设备租约", 409);
  const [run] = body.runId
    ? await d.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.id, body.runId), eq(jobRuns.jobId, id))).limit(1)
    : await d.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.jobId, id), eq(jobRuns.status, "running"))).orderBy(desc(jobRuns.startedAt)).limit(1);
  if (!run) return fail("没有进行中的执行", 409);
  await d
    .update(jobRuns)
    .set({ logs: sql`coalesce(${jobRuns.logs}, '[]'::jsonb) || ${JSON.stringify(body.logs)}::jsonb` })
    .where(eq(jobRuns.id, run.id));
  await d.update(jobs).set({ status: "running" }).where(and(eq(jobs.id, id), eq(jobs.status, "leased")));
  return json({ ok: true });
}
