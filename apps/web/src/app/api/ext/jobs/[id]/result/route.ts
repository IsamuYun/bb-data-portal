import { and, db, desc, devices, eq, inArray, jobRuns, jobs, records, sql } from "@bb/db";
import { jobResultRequest, type JobResultResponse } from "@bb/shared";
import { authDevice, fail, isResponse, json, parseBody } from "@/lib/ext/auth";
import { externalIdFromUrl } from "@/lib/import/parse";
import { enqueueFromListing } from "@/lib/ext/enqueue";
import { withFairfaxMedical } from "@/lib/fairfax/medical";
import { translateRecordSoon } from "@/lib/translate/records";

export const runtime = "nodejs";

/**
 * The extension reports the outcome of a leased job. `done` upserts the record (platform + externalId); a listing
 * job (result carries `enqueue`) instead creates detail jobs in the same dataset and stores no record.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const dev = await authDevice(req);
  if (isResponse(dev)) return dev;
  const body = await parseBody(req, jobResultRequest);
  if (isResponse(body)) return body;
  const { id } = await params;
  const d = db();

  const [job] = await d
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.leasedBy, dev.id), inArray(jobs.status, ["leased", "running"])))
    .limit(1);
  if (!job) return fail("任务不存在、未由本设备租约或已结束", 409);

  const [run] = body.runId
    ? await d.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.id, body.runId), eq(jobRuns.jobId, job.id))).limit(1)
    : await d.select({ id: jobRuns.id }).from(jobRuns).where(and(eq(jobRuns.jobId, job.id), eq(jobRuns.status, "running"))).orderBy(desc(jobRuns.startedAt)).limit(1);

  const isListing = body.enqueue !== undefined;
  // Raw page captures are parsed into record fields here (and again on boot when the parser changes).
  if (body.data && Array.isArray(body.data.medicalProfile)) body.data = withFairfaxMedical(body.data);
  const externalId = isListing ? "" : job.externalId || (typeof body.data?.externalId === "string" ? body.data.externalId : "") || externalIdFromUrl(job.url);
  if (body.status === "done" && !job.dryRun && !isListing && !externalId) return fail("无法确定 externalId，记录无法入库", 400);

  // A finished run whose (optional) document downloads were refused with 401/403 means the site session expired:
  // the record would silently lack photos and reports. Treat it as a login wall instead of saving it.
  const logText = JSON.stringify(body.logs ?? []);
  if (body.status === "done" && !job.dryRun && /HTTP 40[13]\b|tier 2 account/i.test(logText)) {
    body.status = "auth_required";
    body.error = "站点登录已失效（下载报告被拒绝 401/403），请在 Chrome 中重新登录后在设备页“恢复”";
  }

  const res = await d.transaction(async (tx) => {
    let recordId: string | null = null;
    let jobStatus: (typeof jobs.status.enumValues)[number];
    if (body.status === "done" && isListing) {
      jobStatus = "done";
      const n = body.enqueue!.length;
      const msg = job.dryRun
        ? `列表试跑：找到 ${n} 个详情链接（未生成任务）`
        : ((r) => `列表：找到 ${n} 个，新建任务 ${r.created} 个，已有任务跳过 ${r.skipped} 个`)(await enqueueFromListing(tx, job, body.enqueue!));
      body.logs = [...(body.logs ?? []), { t: body.durationMs ?? 0, level: "info", msg }];
    } else if (body.status === "done" && job.dryRun) {
      jobStatus = "done"; // dry run: output lives on the job_run only
    } else if (body.status === "done") {
      const [rec] = await tx
        .insert(records)
        .values({ platformId: job.platformId, externalId, data: body.data ?? {}, sourceUrl: job.url, jobId: job.id, capturedAt: new Date() })
        .onConflictDoUpdate({
          target: [records.platformId, records.externalId],
          set: { data: body.data ?? {}, sourceUrl: job.url, jobId: job.id, capturedAt: new Date(), version: sql`${records.version} + 1` },
        })
        .returning({ id: records.id });
      recordId = rec.id;
      jobStatus = "done";
    } else if (body.status === "failed") {
      jobStatus = job.attempts < job.maxAttempts ? "pending" : "failed";
    } else {
      jobStatus = body.status; // auth_required | skipped
    }
    if (!isListing && !job.externalId && externalId) await tx.update(jobs).set({ externalId }).where(eq(jobs.id, job.id));
    await tx
      .update(jobs)
      .set({ status: jobStatus, leasedBy: null, leaseUntil: null, lastError: body.error ?? null })
      .where(eq(jobs.id, job.id));
    if (run) {
      await tx
        .update(jobRuns)
        .set({ status: body.status, error: body.error ?? null, output: body.data ?? null, logs: body.logs, finishedAt: new Date(), recipeVersion: body.recipeVersion })
        .where(eq(jobRuns.id, run.id));
    }
    // A login wall means every further job on this device will fail: pause it until the user signs in.
    await tx
      .update(devices)
      .set({ currentJobId: null, ...(body.status === "auth_required" ? { status: "paused" as const } : {}) })
      .where(eq(devices.id, dev.id));
    return { ok: true as const, jobStatus, recordId } satisfies JobResultResponse;
  });
  // Translate the new/updated record a few seconds later, once its reports (uploaded next) have been parsed too.
  if (res.recordId) translateRecordSoon(res.recordId);
  return json(res);
}
