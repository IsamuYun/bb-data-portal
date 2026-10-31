import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "BB Collector",
    description: "通用采集执行器：从 BB Data Portal 领取任务并执行服务器下发的 Recipe",
    permissions: ["storage", "alarms", "tabs", "scripting"],
    host_permissions: ["<all_urls>"],
  },
});
