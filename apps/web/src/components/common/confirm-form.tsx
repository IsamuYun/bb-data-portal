"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** A button that opens a confirm dialog, then posts hidden fields to a server action. */
export function ConfirmForm({
  action,
  fields,
  title,
  description,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "default",
  triggerDisabled,
  confirmLabel = "确认",
  variant = "destructive",
}: {
  action: (fd: FormData) => Promise<void>;
  fields: Record<string, string | string[]>;
  title: string;
  description?: ReactNode;
  triggerLabel: ReactNode;
  triggerVariant?: "destructive" | "default" | "outline" | "ghost";
  triggerSize?: "default" | "sm" | "xs";
  triggerDisabled?: boolean;
  confirmLabel?: string;
  variant?: "destructive" | "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const submit = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
    start(async () => {
      try {
        await action(fd);
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} disabled={triggerDisabled} />}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            取消
          </Button>
          <Button variant={variant} onClick={submit} disabled={pending}>
            {pending ? "处理中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
