import { getSettings, getState, setSettings, type RunnerState } from "../../lib/storage";

const $ = (id: string) => document.getElementById(id)!;
const LABEL: Record<RunnerState["phase"], string> = { unpaired: "未配对", idle: "空闲", polling: "轮询中", running: "执行中", paused: "已暂停", error: "出错" };

async function render() {
  const [s, st] = await Promise.all([getSettings(), getState()]);
  const phase = !s.token ? "unpaired" : s.paused ? "paused" : st.phase;
  $("phase").textContent = LABEL[phase] + (st.serverStatus === "paused" ? "（服务端暂停）" : st.serverStatus === "revoked" ? "（已吊销）" : "");
  $("phase").className = `pill ${phase}`;
  $("server").textContent = s.serverUrl;
  $("device").textContent = s.deviceName || "—";
  $("job").textContent = st.currentJob?.url ?? "—";
  $("job").title = st.currentJob?.url ?? "";
  $("stats").textContent = `完成 ${st.stats.done} · 失败 ${st.stats.failed} · 需登录 ${st.stats.authRequired}`;
  $("poll").textContent = st.lastPollAt ? new Date(st.lastPollAt).toLocaleTimeString() : "—";
  $("err").hidden = !st.lastError;
  $("err").textContent = st.lastError ?? "";
  $("toggle").textContent = s.paused ? "继续" : "暂停";
  ($("toggle") as HTMLButtonElement).disabled = !s.token;
}

$("toggle").addEventListener("click", async () => {
  const s = await getSettings();
  await setSettings({ paused: !s.paused });
  if (s.paused) await browser.runtime.sendMessage({ type: "bb:tick" }).catch(() => {});
  await render();
});
$("tick").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "bb:tick" }).catch(() => {});
  setTimeout(render, 500);
});
$("options").addEventListener("click", () => browser.runtime.openOptionsPage());
browser.storage.onChanged.addListener(() => void render());
void render();
