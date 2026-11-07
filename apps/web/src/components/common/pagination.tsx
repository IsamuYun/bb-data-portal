import Link from "next/link";
import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 50;

export function parsePage(v: string | string[] | undefined) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
}

/** Server-side pagination driven by the `page` query param, preserving the other params. */
export function Pagination({ page, total, params, pageSize = PAGE_SIZE }: { page: number; total: number; params: Record<string, string | undefined>; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        第 {from}–{to} 条，共 {total} 条
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} render={page <= 1 ? undefined : <Link href={href(page - 1)} />}>
          上一页
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} render={page >= pages ? undefined : <Link href={href(page + 1)} />}>
          下一页
        </Button>
      </div>
    </div>
  );
}
