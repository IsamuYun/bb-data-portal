import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  // Visible folder (not dot-prefixed) so it shows up in Finder / Chrome's "Load unpacked" picker.
  outDir: "dist",
  manifest: {
    name: "BB Collector",
    description: "通用采集执行器：从 BB Data Portal 领取任务并执行服务器下发的 Recipe",
    version: "0.4.4",
    permissions: ["storage", "alarms", "tabs", "scripting"],
    host_permissions: ["<all_urls>"],
  },
});
