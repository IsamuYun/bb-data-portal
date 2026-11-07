# bb-data-portal

服务端下发采集脚本（Recipe）→ 通用 Chrome 插件执行 → 结果入库（自动翻译）→ 后台管理与导出。
方案见 `docs/plan/2026-10-30-bb-data-portal-plan.md`，验收记录见 `docs/acceptance.md`。

```
apps/web         Next.js 16 + shadcn/ui 后台与 API
apps/extension   Chrome MV3 插件（WXT），通用 Recipe 执行器
packages/shared  zod：Recipe DSL、插件↔服务端协议、解释器
packages/db      Drizzle schema / migrations / seed（含内置翻译字典）
docker/          Dockerfile.web（多阶段：依赖 → 构建后台 → 构建插件 zip → 运行镜像）
scripts/         backup.sh / restore.sh
docs/            方案、验收清单、示例数据
```

## 1. 部署（10 分钟）

要求：Docker 24+（含 compose v2）。不需要安装 Node。

```bash
git clone <repo> bb-data-portal && cd bb-data-portal
cp .env.example .env
# 必改：AUTH_SECRET（≥16 位随机串）、ADMIN_PASSWORD；按需改 APP_URL / WEB_PORT / POSTGRES_PORT
docker compose up -d --build        # 首次构建约 3–5 分钟（含插件 zip）
open http://localhost:3000          # 用 .env 里的 ADMIN_EMAIL / ADMIN_PASSWORD 登录
```

web 容器启动时自动执行数据库迁移与 seed（管理员、cryobank 平台与 Recipe、本地测试页平台、约 260 条翻译字典）。`docker compose logs -f web` 可看到 `[boot] …` 日志；`GET /api/health` 返回 `{"ok":true}` 即就绪。

**局域网 / 公网访问**：把 `.env` 的 `APP_URL` 改成其他电脑可访问的地址（如 `http://192.168.1.10:3000`），`docker compose up -d` 生效。插件配对时填同一个地址。

**生产服务器（Ubuntu 24.04，HTTPS、防火墙、迁移、备份）**：见 [docs/deploy-ubuntu-24.md](docs/deploy-ubuntu-24.md)。

**升级**：`git pull && docker compose up -d --build`。迁移自动执行；升级前建议先备份（见第 6 节）。

## 2. 安装插件与配对

1. 后台 **设置** 页点“下载插件 zip”（镜像内置，随后台一起构建），解压到一个固定目录。
2. Chrome 打开 `chrome://extensions` → 开启“开发者模式” → “加载已解压的扩展程序” → 选择解压目录。
3. 后台 **设备** 页点“生成配对码”（15 分钟有效，一次性）。
4. 右键插件图标 → “选项”：填服务器地址（= `APP_URL`）、设备名、配对码，点“配对”。
5. 设备页显示在线后，插件每 5–30 秒领取任务，在独立的后台标签页执行，结果与图片回传。弹出窗口可暂停 / 继续并查看当前任务。

采集需要登录的站点（如 cryobank 的照片和 GTS 基因检测报告）时，先在同一个 Chrome 里登录该站点。cryobank 的 GTS 报告 PDF 保存为记录媒体（字段 `gtsReport`），服务器解析其中 “GeneAware Expanded Plus Panel” 的 Results Summary，把标记为 CARRIER 的行写入记录的 `gtsCarriers`（套餐名写入 `gtsPanel`；其他套餐只记名称，`gtsCarriers` 为 null）。病史报告 PDF（字段 `medicalReport`）与详细资料问卷 PDF（字段 `profileReport`，cryobank 的 `<编号>LP.pdf`）都由服务器按规则解析，不调用模型：病史解析出生年份/问询日期、`healthRecord`（手术/过敏/食物不耐受）、`familyTable`（按表格分隔线切出的家族史行）、`riskTopics`；问卷为扁平化表单，从 PDF 的矢量图形识别已勾选的选项（`apps/web/src/lib/donor-profile/form.ts`，选中的单选/复选框比空框多出圆点/对勾路径），解析出 GPA、学位、专业、职业、技能、运动、语言、爱好等字段。导出资料时由 `apps/web/src/lib/profile/zh.ts` 按规则写成中文；规则未覆盖的病史短句（`medicalPhrases`）、病名（`familyDiagnoses`）与问卷的自由填写内容走翻译流程：先查词典，缺词才交模型并记入词典，同一短语只付费一次。Fairfax 的附件同样由服务器按规则解析：Genetic Testing PDF 只读第 1 页 Fairfax 自己的 “Genetic Testing Summary” 表（按表格单元格切行），写入 `geneticTests`（全部检测项）、`gtsPanel`，套餐结果为阴性时 `gtsCarriers=[]`（其他结果为 null，需人工查看）；照片集 PDF（字段 `adulthoodPhotos` 上传，随后改存为 `photoSetPdf`）裁出人像，第一张为童年照、其余为成年照，与站点童年缩略图相同的缩略图会被高清裁图替代。解析器升级后 web 容器启动时自动重新解析已保存的 PDF。记录详情页“重新解析报告”可用最新规则重新解析已保存的 PDF。基因筛查结果未能自动提取的记录（记录列表“基因筛查待人工整理”筛选，详情页“编辑”按钮标红）可在编辑页（`/records/<id>/edit`）对照原报告手工填写：未检出携带者，或逐行填写基因、疾病中文名/英文名、携带类型。人工内容存于 `records.manual`，重新采集与重新解析都不会覆盖，导出资料 PDF / HTML 时优先使用；选“使用自动解析结果”保存即撤销。记录详情页的“导出资料 PDF / HTML”按 `docs/template/` 的 Babiology 模板生成单个捐献者的两页资料（HTML 为内嵌图片的单文件，可直接打印为两页 Letter）。Recipe 的 `assertNotMatch` 命中登录页时任务标记为 `auth_required` 并自动暂停设备，登录后在设备页“恢复”。

本地开发也可以手动构建：`pnpm --filter @bb/extension zip` 产物在 `apps/extension/dist/`（`build` 则直接得到可加载的 `dist/chrome-mv3`）。

## 3. 日常使用

1. **数据集 / 导入**：上传 xlsx / csv → 选择 URL 列与外部 ID 列（cryobank 格式自动识别）→ 生成任务。同一平台内外部 ID 唯一，重复导入默认跳过已存在的 ID；其余列作为 seed 随任务保存。原始文件保存在 `MEDIA_DIR/_imports/`。
2. **任务**：按平台 / 数据集 / 状态筛选，支持置顶、取消、重试、重采（单条或按筛选范围批量）。服务端用 `FOR UPDATE SKIP LOCKED` 租约（10 分钟，过期自动回收重派），失败按 `maxAttempts` 自动重试。
3. **记录**：按平台显示字段模板列，每行带首张照片缩略图，可搜索，每页 20 条，勾选后可批量删除（连同媒体文件）。详情页显示中文译文、照片（童年 / 成年各一区块，3 列网格）与原始 JSON。
4. **导出**：选平台和格式（Excel / PDF），可按搜索词或“只导出有照片的记录”筛选；语言可选“中文”（默认，字典 + 模型翻译）或“英文原文”（不翻译，导出采集到的原始内容）。文件异步生成，完成后下载；失败可重试。导出文件（含文件名、说明页、PDF 页眉页脚和文档属性）不包含平台名称、站点等数据来源信息。
   - Excel：一行一条，列顺序为编号 → 童年照片 ×2 → 成年照片 ×2 → 标题 → 简介 → 其余字段；缩略图显示 40×60 px、内嵌原图 200×300 px，不导出外部 ID、来源 URL、采集时间、版本和照片 URL / 路径，首行冻结并带筛选。
   - PDF：A4 每条一张卡片，童年照一行、成年照一行（各最多 5 张），字段三栏网格，`text` 字段整段排版，不含来源 URL / 采集时间 / 版本；中文字体随项目打包（Noto Sans SC，OFL）。
5. **翻译字典**：见第 5 节。
6. **设置**：插件下载、服务器地址、修改密码、系统信息。

## 4. 新增平台指南

1. **平台与 Recipe** 页 → 新建平台（slug、站点 URL）。
2. 平台详情页 **字段模板**：JSON 数组，决定记录列、导出列和翻译方式：
   ```json
   { "key": "eyeColor", "label": "眼睛颜色", "type": "string", "translate": "dict" }
   ```
   `type`：`string` / `number` / `string[]` / `text`（长文本）/ `url`（照片字段，值为图片 URL 数组）。
   `translate`（可选）：`dict` 固定词条查字典（string / string[] 默认）、`llm` 自由文本走模型（text 默认）、`none` 不翻译（number / url 默认；编号、身高、血型等也应设为 none）。
3. **Recipe**（JSON，保存时按 DSL 校验，只有“激活”的版本会下发）：
   ```json
   {
     "platform": "example", "version": 1, "match": "^https://example\\.com/donor/",
     "settings": { "delayMs": [3000, 8000], "timeoutMs": 30000, "maxRetries": 2 },
     "steps": [
       { "op": "navigate", "url": "{{url}}" },
       { "op": "assertNotMatch", "urlPattern": "/login", "reason": "auth_required" },
       { "op": "waitFor", "selector": "h1" },
       { "op": "extract", "fields": {
           "title":    { "selector": "h1" },
           "eyeColor": { "label": "Eye Color" },
           "ancestry": { "label": "Ancestry", "split": "," },
           "about":    { "selector": ".about", "attr": "innerText" },
           "photos":   { "selector": "img.photo", "attr": "src", "all": true, "unique": true }
       } },
       { "op": "downloadMedia", "from": "photos", "as": "photo" },
       { "op": "emit" }
     ]
   }
   ```
   步骤：`navigate` / `waitFor` / `click` / `scroll` / `sleep` / `assertNotMatch` / `extract` / `downloadMedia` / `emit`。`fetchJson`（带页面 cookie 请求站内 JSON 接口，`pick` 取路径如 `data.0.signedUrl` 存入 `into` 字段）；`downloadMedia` 的 `drop: true` 在排队下载后从数据中删掉该字段（适合有效期很短的签名 URL）；模板支持 `{{data.donorNumber|pad:6}}` 左补零。字段规则支持 `selector`（含 `:contains('文本')`）、`label`（按相邻标签取值，适合 dt/dd、th/td、“Label: value”）、`attr`、`all`、`unique`、`regex`、`split`、`default`。插件按 `navigate` 切段：background 驱动跳转，其余步骤注入页面执行；图片由 background 下载（避开 CORS）。
4. **试跑**：Recipe 标签页输入一个 URL 点“试跑”，由在线插件执行一次，结果只写执行日志（任务详情页自动刷新），不入库。调好 selector 后“激活”该版本。
5. 导入该平台的 URL 表格 → 任务自动分发。固定词条第一次出现时会进字典（有模型 key 则自动翻译并回写），之后可在字典页校对。

Recipe DSL 定义在 `packages/shared/src/recipe.ts`，解释器 `packages/shared/src/interpreter.ts`（jsdom 单元测试），插件 API 协议 `packages/shared/src/protocol.ts`。不想用 Chrome 时可用模拟器跑公开页面：`pnpm --filter @bb/shared simulate <APP_URL> <配对码> 200 cryobank`。

## 5. 中文翻译

- **两层**：固定词条（颜色、族裔、宗教、学历、专业、地区等）走 **翻译字典** 页维护的 `dictionary_entries`（内置约 260 条，可增删改，词条可按字段限定，如 English 在祖源里是“英格兰”、在专业里是“英语”）；标题、简介等自由文本走模型。
- **模型**：优先通义千问（`QWEN_API_KEY`，DashScope OpenAI 兼容接口，默认 `qwen-plus`；海外账号设 `QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1`；阿里云“token 计划”等端点的模型名形如 `qwen3.7-plus`，配置的模型不存在时会自动从该端点的 `/models` 选一个 plus > max > flash 的 chat 模型，也可用 `QWEN_MODEL` 固定），没有则用 Claude（`ANTHROPIC_API_KEY`），`TRANSLATE_PROVIDER=qwen|claude` 可强制指定。改 `.env` 后 `docker compose up -d` 生效；设置页显示当前生效模型。
- **时机**：每条记录入库后在响应返回后立即翻译并缓存到 `record_translations`。字典缺词自动交给模型并回写字典；没有模型 key 时该记录标记“待补全”、空词条记录下来供人工填写。导出直接用缓存，只重翻变化过或待补全的记录。
- **字典页**：筛选 / 编辑 / 删除 / 添加词条；“翻译全部记录”把当前字典应用到已有记录（勾选“强制重算”刷新字典字段，模型译文沿用缓存不重复计费）；“AI 填充空词条”用模型批量补齐（需 key）。

## 6. 备份与恢复

数据在三处：Postgres（`pgdata` 卷）、媒体文件（`media` 卷，`/data/media`）、导出文件（`exports` 卷）。

```bash
scripts/backup.sh                 # → backups/<时间戳>/{db.sql.gz, media.tar.gz, exports.tar.gz, env.backup}
scripts/backup.sh /mnt/nas/bb     # 指定备份根目录
scripts/restore.sh backups/20261101-004042   # 交互确认后：停 web → 重建数据库 → 恢复卷 → 启动 web
```

建议用 cron 每天跑一次 backup 并把目录同步到异地；`env.backup` 含密钥，权限已设为 600。迁移到新机器：安装 Docker → clone 仓库 → 复制 `.env` → `docker compose up -d --build` → `scripts/restore.sh <备份目录>`。

## 7. 环境变量

| 变量 | 说明 |
|---|---|
| `AUTH_SECRET` | 会话签名密钥，≥16 位，必填 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 首次 seed 创建的管理员（之后在设置页改密码） |
| `APP_URL` | 后台对外地址，插件配对与本地测试页基于此 |
| `WEB_PORT` / `POSTGRES_PORT` | 宿主机端口（默认 3000 / 5432） |
| `QWEN_API_KEY` / `QWEN_MODEL` / `QWEN_BASE_URL` | 通义千问翻译 |
| `ANTHROPIC_API_KEY` | Claude 翻译（备选） |
| `TRANSLATE_PROVIDER` | `qwen` / `claude` 强制指定 |
| `MEDIA_DIR` / `EXPORT_DIR` / `EXT_ZIP_DIR` | 容器内固定为 `/data/media`、`/data/exports`、`/app/ext`；本地开发默认 `./data/media`、`./data/exports`、`../extension/dist` |

## 8. 本地开发

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate && pnpm db:seed   # 需要 DATABASE_URL（见 .env.example）
pnpm dev                          # http://localhost:3000
pnpm --filter @bb/extension dev   # 插件开发
```

常用：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm db:generate`（改 schema 后生成迁移）。seed 的“本地测试页”平台采集 `/test-page/donor-N.html`，可不依赖外部站点验证整条链路。

## 9. 里程碑

M0 脚手架 → M1 数据与导入 → M2 插件执行器 → M3 cryobank Recipe → M4 导出与翻译 → M5 交付（镜像、插件下载、文档、备份）→ M6 验收与运维（`docs/acceptance.md`）。
