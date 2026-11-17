# 部署到 Ubuntu 24.04（生产环境）

本文是把 bb-data-portal 部署到一台 Ubuntu 24.04 服务器的完整步骤：从新机器初始化，到 HTTPS（Nginx + Cloudflare）、数据迁移、插件切换、备份和升级。README 第 1 节是本机 / 局域网的快速部署，本文是对外提供服务时的做法。

## 0. 方案概览

```
 你的 Chrome（已登录 cryobank / fairfax）   Cloudflare（代理，边缘证书）     Ubuntu 24.04 服务器
 ┌──────────────────────────┐   HTTPS   ┌───────────┐  HTTPS 443  ┌──────────────────────────────────────────────┐
 │ bb 插件：领任务、采集、    │ ────────▶ │ 橙色云朵   │ ──────────▶ │ Nginx（Cloudflare 源服务器证书）               │
 │ 回传结果与 PDF/照片       │               │   └─▶ 127.0.0.1:3000  web 容器（Next.js）     │
 └──────────────────────────┘               │          ├─ 卷 media   /data/media  照片、报告 │
 浏览器后台（同一地址）                        │          ├─ 卷 exports /data/exports 导出文件  │
                                             │          └─▶ 127.0.0.1:5432 postgres 容器     │
                                             │ cron 03:00 → deploy/backup-cron.sh → 异地    │
                                             └──────────────────────────────────────────────┘
```

- **采集仍在你自己的 Chrome 里进行**（站点登录态在你的浏览器），服务器只负责下发任务、入库、解析报告、翻译和导出。所以服务器不需要能访问 cryobank / fairfax，但需要能访问翻译模型接口（通义千问 / Claude）。
- 浏览器 / 插件 → Cloudflare 用 Cloudflare 的通用边缘证书；Cloudflare → 服务器用安装在 Nginx 上的 **Cloudflare 源服务器证书**，SSL/TLS 模式设为 **完全（严格）/ Full (strict)**。
- 只对外开放 22（SSH）、80、443。Postgres 和 web 容器只绑定 127.0.0.1（Docker 映射的端口会绕过 UFW，所以靠绑定地址而不是防火墙来隔离）。
- 数据都在 Docker 卷里：`pgdata`（数据库）、`media`（照片与报告，当前约 2.7 GB，随采集增长）、`exports`。备份脚本把三者打包到一个目录。

## 1. 服务器选型

| 项目 | 建议 |
|---|---|
| 系统 | Ubuntu 24.04 LTS（x86_64 或 arm64 均可） |
| CPU / 内存 | 2 vCPU / 4 GB 起（镜像在服务器上构建，Next.js 构建峰值约 2–3 GB；2 GB 内存的机器要加 swap，见 3.4） |
| 磁盘 | 40 GB 起；媒体约每 100 位捐献者 0.5 GB，按采集规模预留 |
| 地域 | 跟翻译模型同一侧：用 `token-plan.cn-beijing.maas.aliyuncs.com` 等国内端点就选中国大陆机房；用 dashscope-intl 或 Claude 就选海外机房。大陆机房构建镜像需要配置 npm / Docker 镜像源（见 9.3） |
| 域名 | 托管在 Cloudflare 的域名，一个指向服务器公网 IP 的 A 记录，如 `portal.example.com`（大陆机房还需备案） |

## 2. 准备工作（在你自己的电脑上）

1. Cloudflare DNS：添加 A 记录 `portal.example.com → 服务器公网 IP`，**代理状态为“已代理”（橙色云朵）**。`dig +short portal.example.com` 返回的是 Cloudflare 的 IP，这是正常的。
2. Cloudflare → SSL/TLS → 概述：加密模式选 **完全（严格）**。“边缘证书”里打开“始终使用 HTTPS”。
3. Cloudflare → SSL/TLS → 源服务器：如果还没有覆盖该域名的源服务器证书，点“创建证书”（RSA 或 ECC，主机名填 `portal.example.com` 或 `*.example.com`），把证书（PEM）和私钥分别保存下来，私钥只显示一次。已有的通配符源证书可直接复用。
4. SSH：确认能用密钥登录服务器（`ssh root@服务器IP` 或云厂商默认用户）。
5. 代码访问：仓库是私有的话，在服务器上生成部署密钥（见 4.1），加到 GitHub 仓库的 Deploy keys（只读）。

## 3. 系统初始化（服务器，root 或 sudo）

### 3.1 更新与基础工具

```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt -y install ca-certificates curl gnupg git ufw unattended-upgrades rsync
sudo timedatectl set-timezone Asia/Shanghai      # 按实际所在时区；备份时间和日志按此时区
sudo dpkg-reconfigure -plow unattended-upgrades  # 选 Yes：自动安装安全更新
```

### 3.2 部署用户

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh && sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
```

确认能 `ssh deploy@服务器IP` 登录后，关闭密码登录与 root 登录：编辑 `/etc/ssh/sshd_config.d/99-hardening.conf`：

```
PasswordAuthentication no
PermitRootLogin no
```

`sudo systemctl reload ssh`（先保持一个已登录的会话，确认新会话能登录再退出）。

### 3.3 防火墙

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status verbose
```

云厂商的安全组同样只放行 22 / 80 / 443。

可选加固：所有访问都经过 Cloudflare，可以只允许 Cloudflare 的 IP 访问 80/443，别人就无法绕过 Cloudflare 直连源站（服务器上若还有不走 Cloudflare 的站点，不要这样做）：

```bash
sudo ufw delete allow 80,443/tcp
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  sudo ufw allow proto tcp from "$ip" to any port 80,443
done
```

### 3.4 swap（内存 ≤ 4 GB 时）

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.5 安装 Docker（官方 apt 源，含 compose 插件）

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy      # deploy 用户重新登录后生效
docker --version && docker compose version
```

## 4. 获取代码与配置

以下以 `deploy` 用户执行。

### 4.1 拉取代码

```bash
sudo mkdir -p /opt/bb-data-portal && sudo chown deploy:deploy /opt/bb-data-portal
# 私有仓库：生成部署密钥，把 .pub 内容加到 GitHub → Settings → Deploy keys（只读）
ssh-keygen -t ed25519 -f ~/.ssh/bb_deploy -N "" && cat ~/.ssh/bb_deploy.pub
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/bb_deploy
  IdentitiesOnly yes
EOF
git clone git@github.com:IsamuYun/bb-data-portal.git /opt/bb-data-portal
cd /opt/bb-data-portal
ls docker-compose.yml deploy/docker-compose.prod.yml   # 两个都必须存在，否则 compose 会报 "no such file"
```

> 仓库名是 `bb-data-portal`。同一账号下的 `data-portal` 是另一个项目（ADI 地图脚本），克隆错了就会出现 `stat /opt/bb-data-portal/docker-compose.yml: no such file or directory`。

### 4.2 .env

```bash
cp .env.example .env && chmod 600 .env
openssl rand -hex 32     # → AUTH_SECRET
openssl rand -hex 16     # → POSTGRES_PASSWORD
nano .env
```

需要改的项：

| 变量 | 生产值 | 说明 |
|---|---|---|
| `COMPOSE_FILE` | `docker-compose.yml:deploy/docker-compose.prod.yml` | **新增这一行**。之后 `docker compose`、备份 / 恢复脚本都自动带上生产覆盖文件（日志轮转） |
| `POSTGRES_PASSWORD` | 随机串 | 只在**首次**创建数据库时生效；之后改它需同时在库里改密码 |
| `POSTGRES_BIND` | `127.0.0.1` | 数据库只对本机开放 |
| `WEB_BIND` | `127.0.0.1` | web 只给 Nginx 访问 |
| `WEB_PORT` | `3000` | 与 Nginx 配置里 `proxy_pass` 的端口一致；3000 被别的服务占用时两边一起改 |
| `AUTH_SECRET` | `openssl rand -hex 32` | 会话签名密钥；更换会让所有人重新登录 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 你的邮箱 / 强密码 | 只在库里没有管理员时创建；登录后可在设置页改密码 |
| `APP_URL` | `https://portal.example.com` | 必须是浏览器和插件实际访问的地址；https 时登录 Cookie 自动加 Secure |
| `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` | 按你的账号 | token-plan 端点建议直接写 `QWEN_MODEL=qwen3.7-plus`（以 `/models` 列出的为准），省去启动探测 |
| `ANTHROPIC_API_KEY` / `TRANSLATE_PROVIDER` | 可选 | 没有通义千问时用 Claude |

`DATABASE_URL` / `MEDIA_DIR` / `EXPORT_DIR` 只用于本地 `pnpm dev`，容器内由 compose 设置，不用改。

## 5. 首次启动

```bash
cd /opt/bb-data-portal
docker compose up -d --build          # 首次构建约 5–10 分钟（含插件 zip）
docker compose ps                     # web 状态变为 healthy
docker compose logs -f web            # 看到 [boot] applying migrations / seed 后 Ctrl-C
curl -s http://127.0.0.1:3000/api/health   # {"ok":true}
ss -tlnp | grep -E ':3000|:5432'      # 两个端口都只应出现 127.0.0.1
```

## 6. HTTPS 反向代理（Nginx + Cloudflare 源服务器证书）

服务器上已经装有 Nginx，这里只新增一个站点，不影响已有站点。

**放置证书**（已经放好的话，跳过并记下路径）：

```bash
sudo mkdir -p /etc/ssl/cloudflare && sudo chmod 700 /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/portal.example.com.pem   # 粘贴“源证书”
sudo nano /etc/ssl/cloudflare/portal.example.com.key   # 粘贴“私钥”
sudo chmod 600 /etc/ssl/cloudflare/*.key
```

**启用站点**：

```bash
cd /opt/bb-data-portal
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/bb-data-portal
sudo sed -i 's/portal.example.com/你的域名/g' /etc/nginx/sites-available/bb-data-portal
sudo nano /etc/nginx/sites-available/bb-data-portal   # 核对 ssl_certificate / ssl_certificate_key 路径
sudo ln -s /etc/nginx/sites-available/bb-data-portal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

注意：

- `nginx -t` 若报 `"set_real_ip_from" directive is duplicate` 或 `real_ip_header` 重复，说明已有配置在 `http {}` 里设过 Cloudflare 真实 IP，删掉本文件开头那一段即可。
- 配置里用的是 `http2 on;`（Ubuntu 24.04 自带 Nginx 1.24 支持）；更老的 Nginx 把它删掉，改成 `listen 443 ssl http2;`。
- 上传上限 60 MB（`client_max_body_size`）、代理超时 180 秒已在配置中设置（插件回传的报告最大 50 MB，单人资料导出最多等 60 秒翻译）。Cloudflare 本身的限制：免费 / Pro 套餐单次请求体最大 100 MB、等待源站响应最长 100 秒，都在范围内。

**Cloudflare 侧设置**（插件请求不是浏览器页面，过不了人机验证）：

- 安全 → 机器人：**不要**对该域名开启 “Bot Fight Mode / 自动程序攻击模式”，也不要开“我正在受到攻击”模式；否则插件请求 `/api/ext/*` 会被质询拦截，表现为插件一直离线或配对失败。
- 如果开了 WAF 规则，加一条“跳过”规则：`URI 路径 开头为 /api/ext/` → 跳过所有托管规则 / 超级机器人攻击模式。
- 缓存保持默认即可（后台页面与 `/api/*` 不会被缓存）；不要加“缓存所有内容”的页面规则。

验证：

```bash
curl -sI https://你的域名/api/health | head -3        # HTTP/2 200，响应头里有 server: cloudflare
curl -s https://你的域名/api/health                   # {"ok":true}
```

浏览器打开 `https://你的域名`，用 `.env` 里的管理员账号登录。若浏览器显示 Cloudflare 526 错误，是源站证书无效（路径错、证书与私钥不匹配，或证书不覆盖该域名）；521/522 是 Nginx 没在 443 监听或防火墙挡住了 Cloudflare。

## 7. 从本机迁移现有数据（可选）

当前数据在 Mac 的 Docker 卷里（数据库、2.7 GB 媒体、导出文件）。迁移前先让插件暂停（弹出窗口点“暂停”），避免迁移期间产生新数据。

```bash
# Mac：项目目录
scripts/backup.sh ./backups                       # → ./backups/<时间戳>/{db.sql.gz,media.tar.gz,exports.tar.gz,env.backup}
rsync -avP backups/<时间戳> deploy@服务器IP:/opt/bb-data-portal/backups/

# 服务器（第 5 步已启动过一次）
cd /opt/bb-data-portal
scripts/restore.sh backups/<时间戳>               # 输入 y 确认；会替换服务器上的数据库与卷
docker compose logs --tail 50 web                 # 启动时自动迁移到最新表结构、重解析报告
```

注意：

- `env.backup` 是 Mac 的 `.env` 副本，**不要**直接覆盖服务器的 `.env`。如果想让 Mac 上已登录的会话继续有效，可以把其中的 `AUTH_SECRET` 抄过来；否则重新登录即可。
- 恢复后管理员账号与密码以 Mac 库中的为准（`.env` 的 `ADMIN_PASSWORD` 不会覆盖已有管理员）。
- 本机 `docs/template/` 下的两份模板 PDF 不在仓库里，服务器运行不需要它们。

## 8. 插件切换到服务器

1. 新安装：后台 **设置** 页“下载插件 zip” → `chrome://extensions` 加载已解压的扩展程序（README 第 2 节）。
2. 服务器地址只在配对时保存，所以换服务器就要重新配对：到新后台 **设备** 页“生成配对码”（15 分钟有效）→ 右键插件图标 → **选项** → 已配对的先点“解除配对” → 服务器地址填 `https://你的域名`，填设备名称和配对码 → “配对”。迁移过来的旧设备记录可在设备页吊销。
3. 设备页显示在线后，在弹出窗口点“继续”。cryobank / fairfax 的登录仍然在这台 Chrome 中完成。
4. 采集间隔由各平台激活的 Recipe 的 `settings.delayMs` 决定（cryobank 当前为固定 60 秒），迁移后保持不变。

## 9. 备份、监控与升级

### 9.1 每日备份与异地副本

```bash
sudo mkdir -p /var/backups/bb-data-portal && sudo chown deploy:deploy /var/backups/bb-data-portal
sudo touch /var/log/bb-backup.log && sudo chown deploy:deploy /var/log/bb-backup.log
crontab -e
```

加入（保留 14 天；`OFFSITE` 可设为 `user@host:/path`（rsync）或 rclone 远端 `remote:bucket/path`，留空则只保存在本机）：

```
0 3 * * * BACKUP_ROOT=/var/backups/bb-data-portal KEEP_DAYS=14 OFFSITE= /opt/bb-data-portal/deploy/backup-cron.sh >> /var/log/bb-backup.log 2>&1
```

先手动跑一次确认：`/opt/bb-data-portal/deploy/backup-cron.sh && ls -lh /var/backups/bb-data-portal/*/`。

**恢复演练**（上线后做一次，之后每季度一次）：在另一台按本文 3–5 步装好的机器上执行 `scripts/restore.sh <备份目录>`，登录后抽查记录、照片和导出资料 PDF。

### 9.2 日常运维命令

| 目的 | 命令 |
|---|---|
| 状态 | `docker compose ps`、`curl -s https://你的域名/api/health` |
| 日志 | `docker compose logs -f --tail 200 web`（容器日志已限制为 5×20 MB） |
| 磁盘 | `df -h /`、`docker system df`、`sudo du -sh /var/lib/docker/volumes/*` |
| 重启 | `docker compose restart web` |
| 进入数据库 | `docker compose exec postgres psql -U bb bb` |
| 清理旧镜像 | `docker image prune -f`（升级后执行） |

建议在 UptimeRobot 等外部监控上添加 `https://你的域名/api/health` 关键字监控（返回 `"ok":true`）。

### 9.3 升级

```bash
cd /opt/bb-data-portal
deploy/backup-cron.sh                 # 升级前先备份
git pull
docker compose up -d --build          # 启动时自动执行数据库迁移、seed 与报告重解析
docker compose logs --tail 50 web
docker image prune -f
```

各次升级的专项步骤与验收见 `docs/upgrades/`（按日期命名）。

回滚：`git checkout <上一个提交>` 后再 `docker compose up -d --build`；如果新版本已执行了数据库迁移且旧版本不兼容，用升级前的备份 `scripts/restore.sh` 恢复。

**中国大陆机房构建**：Docker Hub 与 npm 可能很慢或不可达。给 Docker 配置镜像加速（`/etc/docker/daemon.json` 的 `registry-mirrors`，改后 `sudo systemctl restart docker`）；npm 可在 `docker/Dockerfile.web` 的依赖安装步骤前设置 `npm_config_registry=https://registry.npmmirror.com`。也可以在本机构建镜像后 `docker save | ssh deploy@服务器 docker load` 传过去。

## 10. 上线验收清单

- [ ] `https://你的域名` 证书有效（Cloudflare 模式为“完全（严格）”），`/api/health` 返回 `{"ok":true}`
- [ ] 插件能配对、心跳正常（没有被 Cloudflare 机器人防护拦截）
- [ ] `ss -tlnp` 中 3000、5432 只绑定 127.0.0.1；外网 `nc -vz 服务器IP 5432` 不通
- [ ] 管理员能登录，设置页已修改默认密码
- [ ] 插件设备在线，跑通一条测试任务（README 第 3 节“本地测试页”平台）
- [ ] 记录详情页“导出资料 PDF / HTML”正常，中文字体正确
- [ ] 翻译可用：新记录入库后标题 / 简介出现中文（日志无 `[qwen]` 持续报错）
- [ ] 手动备份成功，并在另一台机器完成一次恢复演练
- [ ] cron 已配置，第二天 `/var/log/bb-backup.log` 有成功记录

## 11. 安全要点

- `.env` 权限 600，不进 git；`AUTH_SECRET`、数据库密码、模型 API key 只存在于服务器 `.env` 与加密的异地备份中。
- 备份含全部捐献者数据（含病史与基因检测），异地存储请选择加密的目的地（如 rclone crypt）。
- 只开放 22/80/443（可进一步限制 80/443 只允许 Cloudflare IP）；SSH 仅密钥登录；系统安全更新自动安装。
- 源服务器证书私钥（`/etc/ssl/cloudflare/*.key`）权限 600，不要放进仓库或备份到明文位置。
- 后台只有管理员账号可登录；不要把后台地址公开。插件与服务器之间的通信走 HTTPS，设备凭据可在设备页随时吊销。
