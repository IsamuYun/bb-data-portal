"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "@/lib/auth-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  useEffect(() => {
    if (state?.ok) toast.success("密码已更新");
  }, [state]);
  return (
    <form action={action} className="grid max-w-sm gap-3">
      <div className="grid gap-1">
        <Label htmlFor="current">当前密码</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="next">新密码（至少 8 位）</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="confirm">确认新密码</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "修改密码"}
        </Button>
      </div>
    </form>
  );
}
