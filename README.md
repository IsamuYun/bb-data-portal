# bb-data-portal

服务端下发采集脚本（Recipe）→ 通用 Chrome 插件执行 → 结果入库 → 后台管理与导出。
方案见 `docs/plan/2026-10-30-bb-data-portal-plan.md`。

## 结构

```
apps/web         Next.js 16 + shadcn/ui 后台与 API
apps/extension   Chrome MV3 插件（WXT），通用 Recipe 执行器
packages/shared  zod：Recipe DSL、插件↔服务端协议
packages/db      Drizzle schema / migrations / seed
docker/          Dockerfile.web
```

## 一键部署

```bash
cp .env.example .env            # 修改 AUTH_SECRET / ADMIN_* / 端口
docker compose up -d --build
open http://localhost:3000      # 用 .env 里的 ADMIN_EMAIL / ADMIN_PASSWORD 登录
```

web 容器启动时自动执行迁移与 seed（管理员、cryobank 平台与初版 Recipe）。

## 本地开发

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate && pnpm db:seed   # 需要 DATABASE_URL（见 .env.example）
pnpm dev                          # http://localhost:3000
pnpm --filter @bb/extension dev   # 插件开发
```

常用：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm db:generate`（改 schema 后生成迁移）。
