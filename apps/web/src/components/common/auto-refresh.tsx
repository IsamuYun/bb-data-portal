"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Poll the server component while something is in flight (job runs, export generation). */
export function AutoRefresh({ active, everyMs = 3000, message = "等待插件执行" }: { active: boolean; everyMs?: number; message?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return active ? <span className="text-xs text-muted-foreground">{message}，页面每 {everyMs / 1000} 秒自动刷新…</span> : null;
}
