# bb-data-portal 开发计划

> 日期：2026-10-30。本文件为方案文档，尚未开始开发。

## 1. Context（背景与目标）

- 现状：`/Users/isamu/Projects/React/bb-data-portal` 是空项目，只有 `docs/data/cryobank.xlsx`（1 个 sheet，164 行数据，5 列：`border-0 href`=捐献者详情页 URL、`rounded-1 src`=带 CloudFront 签名的头像 URL、`donor-number`、`donor-card-title`、`donor-card-text`）。
- 痛点：每个目标平台单独写一个 Chrome 插件，升级频繁、无法集中管理。
- 目标：做一个 **“服务端下发采集脚本（Recipe）→ 通用 Chrome 插件执行 → 结果回传入库 → 后台管理/导出”** 的平台。插件只做“通用执行器”，适配新平台只需在后台新增/修改 Recipe，不改插件。
- 第一个数据源：cryobank.com 捐献者页。已核实：详情页公开可访问（HTTP 200，无验证码），但 Medical profile / Extended profile / 照片 / 音频等板块需登录账号。因此必须借助用户自己已登录的 Chrome 会话，这正是插件方案的价值所在。
- 注意：xlsx 里的图片 URL 是 CloudFront 签名链接（Policy 里的过期时间约 2026-11-06），过期后不可用，图片必须由插件在页面上下文中重新获取并上传到服务器落盘。

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 仓库结构 | pnpm workspace monorepo：`apps/web`、`apps/extension`、`packages/shared`、`packages/db` | 插件与服务端共享协议类型（zod schema） |
| 前后端 | Next.js 15（App Router，Route Handlers 做 API） | 一个进程同时提供后台 UI 与插件 API |
| 后台 UI | shadcn-admin（shadcn/ui + Tailwind + TanStack Table/Query） | 用户指定 |
| 数据库 | PostgreSQL 16 + Drizzle ORM（migrations 随镜像启动自动执行） | jsonb 存异构采集数据，schema 轻量 |
| 认证 | Auth.js v5 Credentials，管理员账号由环境变量种子化 | 内网/自部署场景够用 |
| 任务队列 | 直接用 Postgres 表 + `SELECT ... FOR UPDATE SKIP LOCKED` | 不引入 Redis，部署更简单 |
| 插件 | Chrome MV3，用 WXT 构建（TS），`chrome.scripting` 注入执行器 | 热更新 Recipe，无需重发插件 |
| 插件↔服务端通信 | 插件轮询 `GET /api/ext/jobs/next`（3–5s）+ `POST` 回传；设备 token 鉴权 | 比 WebSocket 简单、对 MV3 service worker 休眠友好 |
| 文件存储 | 本地卷 `/data/media`（docker volume），Next 路由鉴权后回源 | 可选后续换 S3/MinIO |
| 导出 | Excel：`exceljs`；PDF：`@react-pdf/renderer`（纯 JS，可嵌图片） | 不依赖浏览器内核，镜像小 |
| 部署 | `docker-compose.yml`：`postgres` + `web`；插件 zip 由 web 的下载页提供 | 一条命令起服务 |

## 3. 系统架构

```
┌──────────────┐  轮询取任务/回传结果/上传图片   ┌─────────────────────────────┐
│ Chrome 插件   │ ─────────────────────────────▶ │ Next.js (apps/web)          │
│ (通用执行器)  │ ◀───────────────────────────── │  /api/ext/*  插件 API        │
│ - 设备注册    │   下发 Job(含 Recipe JSON)      │  /api/*      后台 API        │
│ - Recipe 解释 │                                │  后台 UI (shadcn-admin)      │
│ - 页面抽取    │                                │  导出 Excel/PDF              │
└──────────────┘                                └────────────┬────────────────┘
       │ 在用户已登录的 tab 中执行                           │ Drizzle
       ▼                                                     ▼
  目标网站（cryobank.com …）                     PostgreSQL + /data/media 卷
```

### 3.1 Recipe DSL（核心，决定“不改插件”能否成立）

Recipe 是存在 DB 里的 JSON（版本化），由插件内的小型解释器执行。首版指令集：

```jsonc
{
  "platform": "cryobank",
  "version": 3,
  "match": "^https://www\\.cryobank\\.com/donor/(\\d+)",
  "settings": { "delayMs": [3000, 8000], "timeoutMs": 30000, "maxRetries": 2 },
  "steps": [
    { "op": "navigate", "url": "{{job.url}}" },
    { "op": "waitFor", "selector": "h1", "timeoutMs": 15000 },
    { "op": "click", "selector": "[data-tab='medical']", "optional": true },
    { "op": "scroll", "to": "bottom", "times": 3 },
    { "op": "extract", "fields": {
        "donorNumber": { "selector": "...", "regex": "(\\d+)" },
        "title":       { "selector": "h1" },
        "height":      { "selector": "dt:contains('Height') + dd" },
        "ancestry":    { "selector": "...", "split": "," },
        "about":       { "selector": "...", "attr": "innerText" },
        "photos":      { "selector": "img.donor-photo", "attr": "src", "all": true }
    }},
    { "op": "downloadMedia", "from": "photos", "as": "photo" },
    { "op": "emit" }
  ]
}
```

- `extract` 支持：`selector`（CSS；`:contains()` 由解释器实现）、`attr`、`all`、`regex`、`split`、`trim`、`default`、`label`（“按左侧标签文字找右侧值”的通用模式，专治 dt/dd、表格类页面，cryobank 大量使用）。
- `downloadMedia`：在页面上下文 `fetch(url)` 取 blob（自带 cookie，可下签名图），分片 POST 到服务器。
- 所有字段进 `records.data`（jsonb），平台可在后台定义 **字段模板（Schema）** 以便列表展示/导出列顺序。
- 后台提供 **“Recipe 试跑”**：选一个 URL 下发单次调试 Job，返回抽取结果+截图（`chrome.tabs.captureVisibleTab`），不入库。

### 3.2 数据库表（Drizzle）

- `users`：后台用户。
- `platforms`：id、name、baseUrl、fieldSchema(jsonb)、enabled。
- `recipes`：platformId、version、json、isActive、createdBy。
- `devices`：插件实例；token(hash)、name、lastSeenAt、chromeVersion、status。
- `datasets`：一次导入/一批任务（如“cryobank 2026-10 批次”）；sourceFile。
- `jobs`：datasetId、platformId、url、externalId、status(pending/leased/running/done/failed/skipped)、leasedBy、leaseUntil、attempts、lastError、priority。
- `job_runs`：每次执行日志、耗时、截图、原始 extract 输出。
- `records`：platformId、externalId（唯一键 platform+externalId，支持重采覆盖+历史版本号）、data(jsonb)、sourceUrl、capturedAt。
- `media`：recordId、kind(photo/audio/doc)、path、sha256、mime、width/height、originalUrl。
- `exports`：类型(xlsx/pdf)、筛选条件、状态、文件路径、createdBy。

### 3.3 插件 API（`/api/ext/*`，设备 token Bearer）

- `POST /devices/register`：用后台生成的一次性配对码换取设备 token。
- `POST /devices/heartbeat`
- `GET /jobs/next?platforms=...`：原子租约一条 job，返回 job + 当前激活 recipe（带 version，插件本地缓存按 version 失效）。
- `POST /jobs/:id/result`：extract 数据 + 状态 + 错误。
- `POST /jobs/:id/media`：multipart 上传图片（去重按 sha256）。
- `POST /jobs/:id/log`

### 3.4 插件结构（apps/extension）

- `background`(service worker)：注册/轮询/租约续期、打开或复用工作 tab、把 Recipe 注入 content 执行、串行执行（同一设备同一时刻只跑 1 个 job，随机延时，礼貌抓取）。
- `interpreter`（注入脚本）：实现 3.1 的指令集，纯函数化，便于单元测试（vitest + jsdom）。
- `popup`：显示服务器地址、配对状态、当前任务、暂停/继续按钮。
- `options`：服务器 URL、配对码输入。
- 权限：`scripting`、`tabs`、`storage`、`alarms`、`host_permissions: <all_urls>`（由服务端 Recipe 决定实际访问站点）。
- 分发：web 后台 “下载插件” 页提供 zip；用户在 `chrome://extensions` 开发者模式“加载已解压”。（非商店插件只能这样或走企业策略；计划里说明。）

### 3.5 后台页面（shadcn-admin 骨架）

1. Dashboard：设备在线数、任务进度、最近失败。
2. 平台 & Recipe：列表、JSON 编辑器（Monaco）、版本对比、激活、**试跑**。
3. 数据集/导入：上传 xlsx/csv → 选平台 → 列映射（URL 列、外部 ID 列、附带字段）→ 生成 jobs；对 cryobank 预置映射（`border-0 href`→url，`donor-number`→externalId，其余进 `data.seed`）。
4. 任务：筛选/重试/取消/优先级，查看 run 日志与截图。
5. 记录：按平台动态列（来自 fieldSchema）、搜索/过滤、详情页（字段 + 图片画廊 + 原始 json）。
6. 导出：选择平台/筛选 → 生成 xlsx（含图片缩略图列）或 PDF（每位捐献者一张卡片：照片+关键字段+about），后台异步生成，列表下载。
7. 设备：配对码生成、在线状态、暂停某设备。
8. 设置：管理员、服务器对外 URL。

## 4. cryobank 首个数据源的具体落地

- 字段模板（来自已核实的详情页）：donorNumber、title、about、height、weight、eyeColor、hairColor、hairTexture、complexion、bmi、ethnicOrigin、religion、ancestry[]、jewishAncestry、bloodType、cmvStatus、reportedPregnancies、geneticTestType、educationLevel、areaOfStudy、priceIUI、availableVials、requiredForms、jurisdictionNotes；登录后可见：medicalProfile(text)、extendedProfile(text)、personalEssay、photos[]（childhood/adulthood）、audioUrl、gtsSummary。
- Recipe 初版用“标签→值”抽取（`label` 模式）而不是硬编码 class，以降低站点改版影响；真实 selector 在 M3 阶段用插件试跑功能对照页面确定（计划阶段不猜 class 名）。
- 导入：解析 `docs/data/cryobank.xlsx` 生成 164 个 jobs；`donor-card-title/text` 作为种子字段，采集后被页面数据覆盖校验（可作为一致性检查）。
- 图片：以页面上的图片为准重新下载（xlsx 里的签名 URL 作为 fallback，并记录过期时间）。
- 合规提示：采集受 cryobank 条款约束，仅供用户自用；默认低频率（3–8s 随机延时、单并发）。

## 5. 实施里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 脚手架 | monorepo、Next+shadcn-admin、Drizzle+Postgres、Auth、docker-compose、CI lint/test | `docker compose up` 后能登录后台 |
| M1 数据与导入 | 表结构、平台/Recipe CRUD、xlsx 导入向导、jobs 生成、记录列表 | 导入 cryobank.xlsx 得到 164 个 pending jobs |
| M2 插件执行器 | 插件配对、轮询租约、Recipe 解释器（含单元测试）、结果/媒体回传、run 日志 | 用一个本地测试 HTML 页的 Recipe 跑通端到端 |
| M3 cryobank Recipe | 登录会话下试跑、确定 selector、字段模板、图片下载、重试/失败处理 | 164 条记录与照片全部入库，失败可重试 |
| M4 导出 | Excel（exceljs，含缩略图）、PDF（react-pdf 卡片）、异步导出任务与下载 | 导出文件可打开，字段/图片正确 |
| M5 交付 | 镜像多阶段构建、插件 zip 下载页、README（安装/配对/新增平台指南）、备份说明 | 新机器按 README 10 分钟内部署并跑通 |

## 6. 目录结构（建议）

```
bb-data-portal/
├─ apps/web/            # Next.js 15 + shadcn-admin；src/app/(admin)/…、src/app/api/ext/…
├─ apps/extension/      # WXT MV3；src/background、src/interpreter、src/popup、src/options
├─ packages/shared/     # zod：Recipe schema、Job/Result 协议、字段模板类型
├─ packages/db/         # drizzle schema、migrations、seed（管理员、cryobank 平台与初版 recipe）
├─ docker/              # Dockerfile.web、entrypoint（migrate 后启动）
├─ docker-compose.yml
└─ docs/{data,plan}/
```

## 7. 关键风险与对策

- **MV3 service worker 休眠**：用 `chrome.alarms` 周期唤醒 + 任务执行期间保持 tab 活动；租约超时自动回收重派。
- **站点改版**：Recipe 版本化 + 试跑 + 失败率告警；只改后台 JSON。
- **登录态**：插件只在用户已登录的 Chrome 中运行；检测到登录页（Recipe 的 `assertNotMatch` 步骤）即标记 job 为 `auth_required` 并暂停设备。
- **签名图片过期**：以页面即时抓取为准，不依赖 xlsx 中 URL。
- **非商店插件安装**：文档化“加载已解压”；后续可申请商店上架（通用执行器本身不含站点代码，审核风险低）。

## 8. 验证方式（开发完成后）

1. `docker compose up -d` → 浏览器登录后台 → 下载插件并配对 → 设备页显示在线。
2. 导入 `docs/data/cryobank.xlsx` → 任务页出现 164 个 pending。
3. 在已登录 cryobank 的 Chrome 中启动插件 → 观察任务依次完成，记录页出现字段与图片。
4. 对 3 条记录人工对照网页核对字段；对 1 条故意改坏 selector 验证失败日志与重试。
5. 导出 Excel 与 PDF，打开核对列、图片。
6. `pnpm test`：解释器单元测试、API 合约测试（zod）、导入解析测试通过。

## 9. 待用户确认的假设（计划按以下默认执行）

- 单管理员 + 少量后台用户即可，不需要多租户/权限体系。
- 插件通过“加载已解压”安装，不上架商店。
- 图片存本地 docker 卷，不接对象存储。
- PDF 采用“每位捐献者一页卡片”的样式；Excel 一行一人，图片以缩略图列嵌入并附本地路径。
- 项目文档目录使用现有的 `docs/`。
