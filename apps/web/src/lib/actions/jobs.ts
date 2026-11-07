"use server";

import { and, datasets, db, devices, eq, ilike, inArray, jobRuns, jobs, notInArray, or, platforms, recipes, type SQL } from "@bb/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { externalIdFromUrl } from "../import/parse";
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
