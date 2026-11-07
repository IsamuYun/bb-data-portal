"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/platforms";

/**
 * Form bound to a server action with { error, ok } state: shows the error inline,
 * toasts on success. Children render the fields.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "保存",
  successMessage = "已保存",
  className,
  onSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  successMessage?: string;
  className?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.ok) {
      toast.success(successMessage);
      onSuccess?.();
    }
  }, [state, successMessage, onSuccess]);
  return (
    <form action={formAction} className={className ?? "grid gap-4"}>
      {children}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "处理中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
