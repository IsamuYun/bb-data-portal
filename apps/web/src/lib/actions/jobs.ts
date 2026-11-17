"use server";

import { and, datasets, db, desc, devices, eq, ilike, inArray, isNotNull, jobRuns, jobs, notInArray, or, platforms, recipes, records, type SQL } from "@bb/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { externalIdFromUrl } from "../import/parse";
import { MAX_IDS, detailUrlFor, parseIdInput, type IdEntry } from "../jobs/by-id";
import { requireUser } from "../require-user";

export type JobFilter = { platformId?: string; datasetId?: string; status?: string; q?: string };

function filterWhere(f: JobFilter): SQL | undefined {
  const parts: SQL[] = [];
  if (f.platformId) parts.push(eq(jobs.platformId, f.platformId));
  if (f.datasetId) parts.push(eq(jobs.datasetId, f.datasetId));
  if (f.status) parts.push(eq(jobs.status, f.status as (typeof jobs.status.enumValues)[number]));
  if (f.q) parts.push(or(ilike(jobs.url, `%${f.q}%`), ilike(jobs.externalId, `%${f.q}%`))!);
  return parts.length ? and(...parts) : undefined;
}

/** Put failed / cancelled / auth_required / skipped jobs matching the filter back to pending. */
export async function retryJobsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const f: JobFilter = {
    platformId: String(formData.get("platformId") ?? "") || undefined,
    datasetId: String(formData.get("datasetId") ?? "") || undefined,
  };
  const retryable = inArray(jobs.status, ["failed", "cancelled", "auth_required", "skipped"]);
  const where = ids.length ? and(inArray(jobs.id, ids), retryable) : and(filterWhere(f), retryable);
  await db()
    .update(jobs)
    .set({ status: "pending", attempts: 0, lastError: null, leasedBy: null, leaseUntil: null })
    .where(where);
  revalidatePath("/jobs");
  revalidatePath("/");
}

/**
 * Stop leased / running jobs by hand (e.g. a device that crashed or runs an outdated extension). The lease is released
 * and the open run closed; if the device reports later, its result is rejected because it no longer holds the lease.
 */
export async function forceCancelJobsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) return;
  await db().transaction(async (tx) => {
    const stopped = await tx
      .update(jobs)
      .set({ status: "cancelled", leasedBy: null, leaseUntil: null, lastError: "执行中被手动取消" })
      .where(and(inArray(jobs.id, ids), inArray(jobs.status, ["leased", "running"])))
      .returning({ id: jobs.id });
    const stoppedIds = stopped.map((j) => j.id);
    if (stoppedIds.length === 0) return;
    await tx
      .update(jobRuns)
      .set({ status: "failed", error: "执行中被手动取消", finishedAt: new Date() })
      .where(and(inArray(jobRuns.jobId, stoppedIds), eq(jobRuns.status, "running")));
    await tx.update(devices).set({ currentJobId: null }).where(inArray(devices.currentJobId, stoppedIds));
  });
  revalidatePath("/jobs");
  revalidatePath("/");
}

/** Delete jobs that are not in flight (their runs go with them; records captured by them are kept). */
export async function deleteJobsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) return;
  const deleted = await db()
    .delete(jobs)
    .where(and(inArray(jobs.id, ids), notInArray(jobs.status, ["leased", "running"])))
    .returning({ id: jobs.id });
  if (deleted.length === 0) throw new Error("执行中的任务不能删除，请先取消");
  revalidatePath("/jobs");
  revalidatePath("/");
  if (formData.get("from") === "detail") redirect("/jobs");
}

/** Cancel pending jobs (by ids, or every pending job matching the filter). */
export async function cancelJobsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const f: JobFilter = {
    platformId: String(formData.get("platformId") ?? "") || undefined,
    datasetId: String(formData.get("datasetId") ?? "") || undefined,
  };
  const where = ids.length ? and(inArray(jobs.id, ids), eq(jobs.status, "pending")) : and(filterWhere(f), eq(jobs.status, "pending"));
  await db().update(jobs).set({ status: "cancelled" }).where(where);
  revalidatePath("/jobs");
  revalidatePath("/");
}

export async function setJobPriorityAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const priority = Number(formData.get("priority") ?? 0);
  if (!Number.isFinite(priority)) return;
  await db().update(jobs).set({ priority: Math.trunc(priority) }).where(eq(jobs.id, id));
  revalidatePath("/jobs");
}

/** Re-collect finished jobs (by ids or filter): back to pending with a fresh attempt budget. */
export async function recollectJobsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const f: JobFilter = {
    platformId: String(formData.get("platformId") ?? "") || undefined,
    datasetId: String(formData.get("datasetId") ?? "") || undefined,
  };
  const where = ids.length ? and(inArray(jobs.id, ids), eq(jobs.status, "done")) : and(filterWhere(f), eq(jobs.status, "done"));
  await db().update(jobs).set({ status: "pending", attempts: 0, lastError: null, leasedBy: null, leaseUntil: null }).where(where);
  revalidatePath("/jobs");
  revalidatePath("/");
}

/** Statuses a job can be re-collected from; queued / in-flight jobs (pending, leased, running) are left alone. */
const REQUEUEABLE = ["done", "failed", "cancelled", "auth_required", "skipped"] as const;

/**
 * Re-collect the selected jobs: `id` values, or with `all=1` every job matching the list filter
 * (platformId / datasetId / status / q). Done jobs overwrite their record on completion. Returns how many were queued.
 */
export async function requeueSelectedJobsAction(formData: FormData): Promise<{ queued: number }> {
  await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const all = formData.get("all") === "1";
  if (!all && ids.length === 0) throw new Error("请先选择任务");
  const get = (k: string) => String(formData.get(k) ?? "").trim() || undefined;
  const scope = all ? filterWhere({ platformId: get("platformId"), datasetId: get("datasetId"), status: get("status"), q: get("q") }) : inArray(jobs.id, ids);
  const rows = await db()
    .update(jobs)
    .set({ status: "pending", attempts: 0, lastError: null, leasedBy: null, leaseUntil: null })
    .where(and(scope, inArray(jobs.status, [...REQUEUEABLE])))
    .returning({ id: jobs.id });
  revalidatePath("/jobs");
  revalidatePath("/");
  return { queued: rows.length };
}

export type DryRunState = { error?: string } | undefined;

/** Recipe dry run: a high-priority single-attempt job whose output is kept on the run only. */
export async function createDryRunAction(_prev: DryRunState, formData: FormData): Promise<DryRunState> {
  await requireUser();
  const platformId = String(formData.get("platformId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return { error: "请输入完整的 URL" };
  const d = db();
  const [p] = await d.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, platformId)).limit(1);
  if (!p) return { error: "平台不存在" };
  const [job] = await d
    .insert(jobs)
    .values({ platformId, url, externalId: externalIdFromUrl(url) || null, priority: 1000, maxAttempts: 1, dryRun: true })
    .returning({ id: jobs.id });
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export type ListingState = { error?: string } | undefined;

/**
 * Collect a platform's donor list straight from a results page: creates a dataset plus one listing job. The device
 * pages through the results with the active recipe's `listing` steps and the server turns every link into a detail
 * job in that dataset.
 */
export async function createListingJobAction(_prev: ListingState, formData: FormData): Promise<ListingState> {
  const user = await requireUser();
  const platformId = String(formData.get("platformId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return { error: "请输入完整的 URL" };
  const d = db();
  const [r] = await d
    .select({ json: recipes.json })
    .from(recipes)
    .where(and(eq(recipes.platformId, platformId), eq(recipes.isActive, true)))
    .limit(1);
  if (!r) return { error: "该平台没有激活的 Recipe" };
  if (!r.json.listing) return { error: "激活的 Recipe 没有 listing（列表页）配置" };
  if (!new RegExp(r.json.listing.match).test(url)) return { error: `URL 不是列表页（不匹配 ${r.json.listing.match}）` };
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
  const name = String(formData.get("name") ?? "").trim() || `列表页采集 ${stamp}`;
  const jobId = await d.transaction(async (tx) => {
    const [ds] = await tx.insert(datasets).values({ platformId, name, createdBy: user.id }).returning({ id: datasets.id });
    const [job] = await tx
      .insert(jobs)
      .values({ datasetId: ds.id, platformId, url, externalId: null, priority: 900, maxAttempts: 2 })
      .returning({ id: jobs.id });
    return job.id;
  });
  revalidatePath("/datasets");
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

export type CollectByIdState = { error?: string; message?: string; problems?: string[] } | undefined;

/** Priority of jobs queued by hand: ahead of imports and listing results. */
const MANUAL_PRIORITY = 900;

/**
 * "按 ID 采集": for each donor ID (or pasted profile URL) of one platform, re-queue its latest job, or create a job
 * when there is none. Either way it goes to the front of the queue with a fresh attempt budget; a finished capture
 * overwrites the record (and clears a delisted mark), a 404 marks it delisted. Jobs a device is running are left alone.
 */
export async function collectByIdsAction(_prev: CollectByIdState, formData: FormData): Promise<CollectByIdState> {
  await requireUser();
  const platformId = String(formData.get("platformId") ?? "");
  const entries = parseIdInput(String(formData.get("ids") ?? ""));
  if (!platformId) return { error: "请选择数据源" };
  if (entries.length === 0) return { error: "请输入 Donor ID" };
  if (entries.length > MAX_IDS) return { error: `一次最多 ${MAX_IDS} 个 ID（当前 ${entries.length} 个）` };
  const r = await queueCollect(platformId, entries);
  if ("error" in r) return r;
  revalidatePath("/jobs");
  revalidatePath("/");
  const parts = [r.created ? `新建 ${r.created} 个` : "", r.requeued ? `重采 ${r.requeued} 个` : "", r.busy ? `${r.busy} 个正在执行，未改动` : ""].filter(Boolean);
  return { message: parts.length ? `已排到队首：${parts.join("，")}` : "没有可排队的任务", problems: r.problems };
}

/** Re-collect one record ("更新数据" on the record page): same rules as 按 ID 采集. */
export async function recollectRecordAction(id: string): Promise<{ message: string }> {
  await requireUser();
  const [rec] = await db().select({ platformId: records.platformId, externalId: records.externalId, sourceUrl: records.sourceUrl }).from(records).where(eq(records.id, id)).limit(1);
  if (!rec) throw new Error("记录不存在");
  const r = await queueCollect(rec.platformId, [{ externalId: rec.externalId, url: rec.sourceUrl }]);
  if ("error" in r) throw new Error(r.error);
  if (r.problems.length) throw new Error(r.problems[0]);
  revalidatePath(`/records/${id}`);
  revalidatePath("/jobs");
  return { message: r.busy ? "该记录正在采集中，完成后页面会自动刷新" : "已排到队首，插件采集完成后页面会自动刷新" };
}

type QueueResult = { error: string } | { created: number; requeued: number; busy: number; problems: string[] };

async function queueCollect(platformId: string, entries: IdEntry[]): Promise<QueueResult> {
  const d = db();
  const [act] = await d.select({ json: recipes.json }).from(recipes).where(and(eq(recipes.platformId, platformId), eq(recipes.isActive, true))).limit(1);
  if (!act) return { error: "该数据源没有激活的 Recipe" };
  const match = new RegExp(act.json.match);
  const ids = entries.map((e) => e.externalId);

  const existingJobs = await d
    .select({ id: jobs.id, externalId: jobs.externalId, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.platformId, platformId), inArray(jobs.externalId, ids), eq(jobs.dryRun, false)))
    .orderBy(desc(jobs.createdAt));
  const latestJob = new Map<string, (typeof existingJobs)[number]>();
  for (const j of existingJobs) if (j.externalId && !latestJob.has(j.externalId)) latestJob.set(j.externalId, j);
  const recs = await d
    .select({ externalId: records.externalId, sourceUrl: records.sourceUrl })
    .from(records)
    .where(and(eq(records.platformId, platformId), inArray(records.externalId, ids)));
  const recUrl = new Map(recs.map((r) => [r.externalId, r.sourceUrl]));
  // A known profile URL of this platform, to build the URL of an ID that was never collected.
  const [sample] = await d
    .select({ url: records.sourceUrl, externalId: records.externalId })
    .from(records)
    .where(eq(records.platformId, platformId))
    .orderBy(desc(records.capturedAt))
    .limit(1);
  const [jobSample] = sample
    ? [undefined]
    : await d
        .select({ url: jobs.url, externalId: jobs.externalId })
        .from(jobs)
        .where(and(eq(jobs.platformId, platformId), isNotNull(jobs.externalId)))
        .orderBy(desc(jobs.createdAt))
        .limit(1);
  const tpl = sample ?? (jobSample?.externalId ? { url: jobSample.url, externalId: jobSample.externalId } : undefined);

  const requeue: string[] = [];
  const create: { externalId: string; url: string }[] = [];
  const problems: string[] = [];
  let busy = 0;
  for (const e of entries) {
    const job = latestJob.get(e.externalId);
    if (job) {
      if (job.status === "leased" || job.status === "running") busy++;
      else requeue.push(job.id);
      continue;
    }
    const url = e.url ?? recUrl.get(e.externalId) ?? (tpl ? detailUrlFor(e.externalId, tpl) : null);
    if (!url) problems.push(`${e.externalId}：无法确定详情页地址，请粘贴完整 URL`);
    else if (!match.test(url)) problems.push(`${e.externalId}：URL 不匹配该数据源的 Recipe（${url}）`);
    else create.push({ externalId: e.externalId, url });
  }

  await d.transaction(async (tx) => {
    if (requeue.length)
      await tx
        .update(jobs)
        .set({ status: "pending", attempts: 0, priority: MANUAL_PRIORITY, lastError: null, leasedBy: null, leaseUntil: null })
        .where(inArray(jobs.id, requeue));
    if (create.length)
      await tx.insert(jobs).values(create.map((c) => ({ platformId, url: c.url, externalId: c.externalId, priority: MANUAL_PRIORITY, seed: { manual: true } })));
  });
  return { created: create.length, requeued: requeue.length, busy, problems };
}
