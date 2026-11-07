"use client";

import { Plus } from "lucide-react";
import { ActionForm } from "@/components/common/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlatformAction } from "@/lib/actions/platforms";

export function CreatePlatformDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        新建平台
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建平台</DialogTitle>
          <DialogDescription>创建后可在详情页配置字段模板与 Recipe。</DialogDescription>
        </DialogHeader>
        <ActionForm action={createPlatformAction} submitLabel="创建">
          <div className="grid gap-2">
            <Label htmlFor="slug">slug</Label>
            <Input id="slug" name="slug" placeholder="例如 cryobank" required pattern="[a-z0-9][a-z0-9-]+" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">名称</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="baseUrl">站点 URL</Label>
            <Input id="baseUrl" name="baseUrl" type="url" placeholder="https://" required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked /> 启用
          </label>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
