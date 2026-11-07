/** Persistent settings (sync across the user's Chrome profile is unnecessary; local is fine). */
export type Settings = {
  serverUrl: string;
  token: string | null;
  deviceId: string | null;
  deviceName: string;
  /** User-side pause (independent from the server-side device status). */
  paused: boolean;
};

export type RunnerState = {
  phase: "unpaired" | "idle" | "polling" | "running" | "paused" | "error";
  serverStatus: "active" | "paused" | "revoked" | null;
  currentJob: { id: string; url: string; startedAt: number } | null;
  lastError: string | null;
  lastPollAt: number | null;
  stats: { done: number; failed: number; authRequired: number };
  workTabId: number | null;
};

export const DEFAULT_SETTINGS: Settings = { serverUrl: "http://localhost:3000", token: null, deviceId: null, deviceName: "", paused: false };
export const DEFAULT_STATE: RunnerState = {
  phase: "unpaired",
  serverStatus: null,
  currentJob: null,
  lastError: null,
  lastPollAt: null,
  stats: { done: 0, failed: 0, authRequired: 0 },
  workTabId: null,
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}
export async function setSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await browser.storage.local.set({ settings: { ...cur, ...patch } });
}
export async function getState(): Promise<RunnerState> {
  const { state } = await browser.storage.local.get("state");
  return { ...DEFAULT_STATE, ...(state as Partial<RunnerState> | undefined) };
}
export async function setState(patch: Partial<RunnerState>) {
  const cur = await getState();
  await browser.storage.local.set({ state: { ...cur, ...patch } });
}
