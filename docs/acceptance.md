# 验收记录（M6）

对应方案 §8「验证方式」。环境：macOS，Docker Desktop，`docker compose up -d --build`，后台 `http://localhost:3002`（`.env` 里 `WEB_PORT=3002`）。日期：2026-11-01。

| # | 验收项 | 结果 | 证据 / 说明 |
|---|---|---|---|
| 1a | `docker compose up -d --build` 后能登录后台 | ✅ | 镜像多阶段构建（依赖 → 后台 → 插件 zip → 运行镜像），启动日志 `[boot] applying migrations` + seed；`GET /api/health` → `{"ok":true}` |
| 1b | 设置页下载插件 zip | ✅ | `GET /api/ext/download`（需登录，未登录 401）返回 `bbextension-0.2.0-chrome.zip`（66 KB，10 个文件，manifest v3） |
| 1c | 配对后设备页显示在线 | ✅ | 真实 Chrome（设备 "Chrome · MacIntel"）已配对在线；jsdom 模拟器用一次性配对码注册成功（`/api/ext/devices/register`） |
| 2 | 导入 `docs/data/cryobank.xlsx` 得到 164 个 pending 任务 | ✅（M1/M3 已验证） | 当前库中 164 条 cryobank 记录全部来自该导入；导入向导自动识别 URL / ID 列，重复 ID 跳过 |
| 3 | 插件依次完成任务，记录页出现字段与图片 | ✅ | 本次新建 3 个本地测试页任务，在线 Chrome 插件数秒内全部完成，每条 2 张照片入库；cryobank 164 条含 987 张照片（M3） |
| 4a | 3 条记录人工对照网页核对字段 | ✅（M3） | cryobank Recipe 按 label 抽取，字段模板 26 列与页面一致 |
| 4b | 故意改坏 selector 验证失败日志与重试 | ✅（M3） | 试跑只写执行日志；失败任务按 `maxAttempts` 回到 pending，任务详情页显示错误 |
| 5 | 导出 Excel / PDF 并核对 | ✅ | Excel 164 行、654 张缩略图（编号 → 童年 ×2 → 成年 ×2 → 标题 → 简介 → 其余字段，缩略图显示 40×60、内嵌 200×300，无外部 ID / 来源 / 采集时间 / 版本 / 照片路径，文件名与说明页不含平台名），字典与模型字段为中文；PDF 164 页，童年/成年照各一行，无来源 / 时间 / 版本 / 平台名，中文字体正常 |
| 6 | `pnpm test` 全部通过 | ✅ | shared 9 + web 23（解释器、导入解析、导出、翻译核心 / 字典 / Qwen 回退） |
| 7 | 翻译：字典 + 模型，入库即译 | ✅ | 入库后 `after()` 自动翻译；通义千问（用户端点 token-plan，`qwen-plus` 不存在时自动从 `/models` 选到 `qwen3.7-plus`）；3 条测试记录标题与简介译出，`pending=0`；模型失败时保留字典译文并标记待补全 |
| 8 | 备份 / 恢复 | ✅ 备份；恢复脚本未在生产数据上演练 | `scripts/backup.sh` 生成 `db.sql.gz`（1.3 MB）+ `media.tar.gz`（31 MB）+ `exports.tar.gz`；`restore.sh` 逻辑：停 web → 重建库 → 解压卷 → 启 web，建议在新机器上演练一次 |
| 9 | 修改密码 | ✅ | 设置页表单；错误的当前密码返回“当前密码错误” |

## 人工待办

- 在一台干净机器上按 README 第 1 节部署一次，计时确认 10 分钟内完成，并执行一次 `scripts/restore.sh` 演练。
- 把 `scripts/backup.sh` 加入 cron（如每天 03:00），备份目录同步到异地。
- 首次部署后在设置页修改管理员密码；`.env` 中的 `AUTH_SECRET` 使用随机值。
- 通义千问：如需固定模型，在 `.env` 设置 `QWEN_MODEL=qwen3.7-plus`（或 `/models` 列出的其他 chat 模型），避免每次进程启动时多一次 404 探测。

## 已知限制

- 插件以“加载已解压”方式安装，Chrome 更新后可能提示开发者模式扩展，属正常现象。
- 需要登录的站点（cryobank 照片）只能由真实 Chrome 采集；jsdom 模拟器仅适用于公开页面。
- 翻译缓存按记录文本哈希失效；手工改字典后需在字典页“强制重算”才会刷新已有记录的字典字段。
