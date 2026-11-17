# 2026-11-17 服务器升级：捐献者可用状态、Purchase vials、按 ID 采集

## 本次变更

| 功能 | 说明 |
|---|---|
| 可用状态 | 记录新增“可用状态”：可购买 / 不可用·售罄 / 不可用·已下架 / 未知。记录列表新增该列与筛选（含“不可用（售罄或已下架）”），详情页标题下显示 |
| 下架不删除 | 重新采集时来源页 404（Cryobank 返回 “Page Not Found”）：任务标为“已跳过”、不再重试；记录保留并标记已下架（记下首次发现日期）。之后若再次采集成功，标记自动清除 |
| Purchase vials | Cryobank 新增字段“购买试管”：每种试管（IUI / ICI / ICSI）的价格与可售数量。全部为 0 或页面没有购买面板 → 售罄；面板被 “Required forms”（需先签携带者确认书）挡住 → 未知 |
| 按 ID 采集 | 任务页新增“按 ID 采集”：输入一个或多个 Donor ID（或粘贴详情页 URL），已有任务的重采，没有的新建，均排在队首 |
| 更新数据 | 记录详情页的“重新解析报告”改为“更新数据”：到来源 URL 重新采集（页面、照片、报告 PDF），采集中按钮显示进度，完成后页面自动刷新 |

数据库变更（迁移 `0007_records_availability`，只增不改）：`records` 表新增 `delisted_at`（可空时间戳）与 `availability`（由数据自动计算的生成列）及其索引。

Recipe：启动时 seed 会在当前激活的 Cryobank Recipe 基础上派生一个新版本并激活（保留后台手改内容），备注为“新增采集 Purchase vials（各类型价格/库存），并识别已下架捐献者（404）”。**插件无需更新。**

## 一、本机：推送代码

```bash
cd ~/Projects/React/bb-data-portal
git checkout main
git merge --ff-only feat/cryobank-availability
git push origin main
```

## 二、服务器：升级

```bash
ssh deploy@你的服务器
cd /opt/bb-data-portal

# 1. 升级前备份（数据库 + 媒体文件）
deploy/backup-cron.sh
ls -lh /var/backups/bb-data-portal/ | tail -3     # 确认生成了今天的备份

# 2. 记下当前提交，回滚时使用
git rev-parse --short HEAD

# 3. 拉取并重建（启动时自动迁移 + seed）
git pull
git log --oneline -1                              # 应为本次提交
docker compose up -d --build
docker compose ps                                 # web 变为 healthy

# 4. 查看启动日志
docker compose logs --tail 80 web | grep -E "boot|seed|error|Error"
```

日志中应能看到（Recipe 版本号以服务器实际为准）：

```
[boot] applying migrations ...
seed: cryobank field added (purchaseVials)
seed: cryobank recipe vN (+purchase vials) activated
```

`seed: cryobank model-summary fields retired` 每次启动都会出现，属正常。

## 三、服务器：验证

```bash
# 新字段与迁移
docker compose exec postgres psql -U bb bb -c "\d records" | grep -E "delisted_at|availability"

# 现有记录的可用状态分布（Cryobank 旧数据按原“可售数量”推算，重新采集后改用 Purchase vials）
docker compose exec postgres psql -U bb bb -c "select p.slug, r.availability, count(*) from records r join platforms p on p.id = r.platform_id group by 1, 2 order by 1, 2;"

# 激活的 Cryobank Recipe 已带 404 识别
docker compose exec postgres psql -U bb bb -c "select r.version, r.is_active, r.json->>'gonePattern' as gone from recipes r join platforms p on p.id = r.platform_id where p.slug = 'cryobank' order by r.version desc limit 2;"

curl -s https://你的域名/api/health                 # 返回 "ok":true

docker image prune -f
```

## 四、页面验收

1. **记录列表**：出现“可用状态”列；筛选“可用状态 → 不可用（售罄或已下架）”可用。
2. **任务页 → 按 ID 采集**：数据源选 California Cryobank，输入一个已有 ID（如 `16495`）→ 提示“重采 1 个”；输入一个新 ID → 提示“新建 1 个”。
3. 插件采完后打开该记录：出现“购买试管”表格，标题下显示可用状态。
4. **记录详情 → 更新数据**：按钮变为“更新中（排队中）…”，采集完成后页面自动刷新。
5. **已下架**：对一个官网已删除的 ID 重新采集 → 任务“已跳过”，记录变为“不可用·已下架”，数据仍在。

## 五、回滚

```bash
cd /opt/bb-data-portal
git checkout <第二步记下的提交>
docker compose up -d --build
```

- 数据库迁移只新增字段，旧版本可以直接运行在新表结构上，一般**不需要**恢复备份。
- 回滚后需在后台“平台与 Recipe → California Cryobank”把 Recipe **切回上一个版本**：旧版本服务端不会解析新 Recipe 采集的 Purchase vials 原始字段。
- 如需完全恢复到升级前：`scripts/restore.sh <第二步之前的备份目录>`。
