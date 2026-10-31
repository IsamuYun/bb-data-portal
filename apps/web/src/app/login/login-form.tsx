"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">BB Data Portal</CardTitle>
        <CardDescription>登录后台以管理采集任务与数据</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">密码</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
