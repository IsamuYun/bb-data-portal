"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RetryButton({ id, action }: { id: string; action: (fd: FormData) => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.append("id", id);
          try {
            await action(fd);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "操作失败");
          }
        })
      }
    >
      重试
    </Button>
  );
}
