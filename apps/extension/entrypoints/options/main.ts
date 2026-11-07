import { api, ApiError } from "../../lib/api";
import { getSettings, setSettings, setState } from "../../lib/storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (text: string, cls: "ok" | "err" | "") => {
  const el = $("msg");
  el.hidden = false;
  el.className = `msg ${cls}`;
  el.textContent = text;
};

async function refresh() {
  const s = await getSettings();
  $<HTMLInputElement>("serverUrl").value = s.serverUrl;
  $<HTMLInputElement>("deviceName").value = s.deviceName || `Chrome · ${navigator.platform}`;
  $("status").textContent = s.token ? `已配对：${s.deviceName}（${s.serverUrl}）` : "尚未配对";
  $("unpair").hidden = !s.token;
}

$("pair").addEventListener("click", async () => {
  const serverUrl = $<HTMLInputElement>("serverUrl").value.trim().replace(/\/$/, "");
  const deviceName = $<HTMLInputElement>("deviceName").value.trim();
  const code = $<HTMLInputElement>("code").value.trim().toUpperCase();
  if (!/^https?:\/\//.test(serverUrl)) return msg("服务器地址需以 http:// 或 https:// 开头", "err");
  if (!deviceName || code.length < 4) return msg("请填写设备名称和配对码", "err");
  try {
    const r = await api.register(serverUrl, {
      pairingCode: code,
      name: deviceName,
      chromeVersion: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1],
      extVersion: browser.runtime.getManifest().version,
    });
    await setSettings({ serverUrl, deviceName: r.name, token: r.token, deviceId: r.deviceId, paused: false });
    await setState({ phase: "idle", lastError: null, serverStatus: "active" });
    $<HTMLInputElement>("code").value = "";
    msg("配对成功，插件已开始领取任务。", "ok");
    await browser.runtime.sendMessage({ type: "bb:tick" }).catch(() => {});
    await refresh();
  } catch (e) {
    msg(`配对失败：${e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)}`, "err");
  }
});

$("unpair").addEventListener("click", async () => {
  await setSettings({ token: null, deviceId: null });
  await setState({ phase: "unpaired", currentJob: null, serverStatus: null });
  msg("已解除配对。后台可在“设备”页吊销该设备。", "");
  await refresh();
});

void refresh();
