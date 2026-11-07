import type { HeartbeatResponse, JobResultRequest, JobResultResponse, MediaUploadResponse, NextJobResponse, RegisterRequest, RegisterResponse } from "@bb/shared";
import { getSettings } from "./storage";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const s = await getSettings();
  const headers = new Headers(init.headers);
  if (init.auth !== false) {
    if (!s.token) throw new ApiError("未配对", 401);
    headers.set("authorization", `Bearer ${s.token}`);
  }
  if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
  const res = await fetch(s.serverUrl.replace(/\/$/, "") + path, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

export const api = {
  register: (serverUrl: string, body: RegisterRequest) =>
    fetch(serverUrl.replace(/\/$/, "") + "/api/ext/devices/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as RegisterResponse & { error?: string };
      if (!r.ok) throw new ApiError(j.error ?? `${r.status}`, r.status);
      return j;
    }),
  heartbeat: (body: { chromeVersion?: string; extVersion?: string; currentJobId?: string | null }) =>
    call<HeartbeatResponse>("/api/ext/devices/heartbeat", { method: "POST", body: JSON.stringify(body) }),
  nextJob: () => call<NextJobResponse>("/api/ext/jobs/next"),
  result: (jobId: string, body: JobResultRequest) => call<JobResultResponse>(`/api/ext/jobs/${jobId}/result`, { method: "POST", body: JSON.stringify(body) }),
  log: (jobId: string, runId: string, logs: { t: number; level: "info" | "warn" | "error"; msg: string }[]) =>
    call<{ ok: true }>(`/api/ext/jobs/${jobId}/log`, { method: "POST", body: JSON.stringify({ runId, logs }) }),
  media: (jobId: string, form: FormData) => call<MediaUploadResponse>(`/api/ext/jobs/${jobId}/media`, { method: "POST", body: form }),
};
