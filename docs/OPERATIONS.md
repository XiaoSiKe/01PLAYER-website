# 零一玩家官网运维手册

## 1. 管理边界

零一玩家官网只管理以下资源：

- 域名：`club.01aiedu.com`
- Nginx：`/etc/nginx/conf.d/020-01aiclub.conf`
- 静态内容：从 `/etc/01PLAYER/static-root` 读取，新装默认 `/var/www/01PLAYER`，已有站点可沿用 `/var/www/01aiclub`
- 工具：`/usr/local/lib/01aiclub`
- 控制：`/etc/01PLAYER`
- 用户：`01aiclub-deploy`
- 日志：`/var/log/nginx/01PLAYER.*.log`
- 证书：`/etc/letsencrypt-01aiclub`
- systemd：`01aiclub-certbot.service`、`01aiclub-certbot.timer`

禁止把发布脚本指向 `/var/www/25thgame`、`/var/www/01yang-company-website`，禁止编辑其它 Nginx 配置。

## 2. 日常发布

2026-11-28 上线前验收期间，仓库变量 `CLUB_AUTO_DEPLOY=0`，自动发布已暂停。合并 PR 仍运行官网回归和后台集成检查，但不会触发云效或验收线上新版本。原生 GitHub push Webhook 保持停用。当前验收记录见[上线前检查](RELEASE-READINESS.md)。

用户明确同意上线后，才可把仓库变量 `CLUB_AUTO_DEPLOY` 设为 `1` 并运行目标 main 的检查工作流。仅修改变量不会发布；重跑旧任务可能使用旧提交，必须核对提交 SHA。发布开关未设置或值不为 `1` 时，工作流和触发脚本均不发布。

开关启用后，GitHub Actions 的 `Website checks` 执行回归检查和完整构建，检查通过后经 HTTPS 自动触发云效。云效执行：

1. 从公共 GitHub 仓库拉取 `main`。
2. 下载并校验固定 Node.js 24.16.0。
3. `npm ci` 和生产构建。
4. 校验 `dist/SHA256SUMS` 与必要资源。
5. 使用强制命令 SSH 密钥上传归档。
6. 服务器安全解包、原子切换并做本机健康检查。

流水线失败时不会切换线上版本；切换后验收失败会自动恢复。

GitHub 工作流在触发云效后会等待官网 `version.json` 返回本次 main 提交 SHA；仅收到 Webhook 的 HTTP 200 不代表发布成功。触发入口最多重试三次，同时检查云效响应的 `successful` 字段。发布只允许当前仓库 main 分支的 push 事件，PR 检查不会触发生产发布。同一分支的 GitHub 工作流串行执行。

`CLUB_FLOW_WEBHOOK_URL` 保存在该 GitHub 仓库的 Actions Secret 中，必须使用 `https://flow-openapi.aliyun.com/scm/webhook/…`。不在源码、日志或配置模板中保存完整地址；云效界面返回的 HTTP 示例也必须升级为 HTTPS。此前的 GitHub 原生 push Webhook（ID `672788547`）已停用，避免与工作流重复发布。云效通用 Git 来源接收工作流转发的 push，不自行轮询发布。暂停期间不得重启原生 Webhook、手动运行云效或直接执行 `ci-publish.sh`。

相关入口：

- [GitHub 构建与发布](https://github.com/XiaoSiKe/01PLAYER-website/actions/workflows/ci.yml)
- [云效运行状态](https://flow.aliyun.com/pipelines/5236605/current)
- `node --test scripts/trigger-flow.test.mjs`：验证分支/仓库/提交保护、HTTPS 限制、应用错误、网络重试和线上版本验收。

排查自动发布时先查看该提交的 GitHub Actions：构建失败不会触发云效；触发失败会明确标为失败；等待版本超时则继续检查云效运行记录。不要根据旧的 Webhook 投递记录或 HTTP 200 判断新提交已经上线。修复临时故障后可以重跑失败的 GitHub job，或从云效控制台手动运行 main 作为恢复方式。

## 3. 本机运维配置

`npm run ops:check` 可直接运行。它从公网检查官网、报名接口、运营后台、CDN 证书和同机受保护站点。查询云效运行记录时，再复制公开模板到私有目录：

```bash
install -d -m 700 ~/.local/share/01PLAYER/ops
install -m 600 deploy/ops.env.example ~/.local/share/01PLAYER/ops/ops.env
```

五年只读云效 PAT 存入 macOS 钥匙串，私有配置只保存 service 名称。任何令牌、Cookie、私钥正文都不得进入项目文件或 Git。

常用只读命令：

```bash
npm run ops:check
npm run ops:status
npm run ops:runs
```

## 4. 健康检查

```bash
curl -fsS https://club.01aiedu.com/ > /dev/null
curl -fsS https://club.01aiedu.com/version.json
curl -fsS https://club.01aiedu.com/lingyi-logo.jpg > /dev/null
```

CDN 接入后，检查响应头中的 `Via`、`X-Cache` 与 `Age`。重复访问带哈希的 `/assets/` 资源应命中缓存。首页和 `version.json` 应保持不缓存，并与源站当前版本一致。首屏的 `site:first-screen-ready` 性能标记记录 16 张隧道照片已就绪，可在浏览器 CDP 中用 `scripts/probe-startup.js` 检查。

服务器内部可绕过公网 DNS 验证当前 Nginx：

```bash
curl --resolve club.01aiedu.com:443:127.0.0.1 \
  https://club.01aiedu.com/version.json
```

## 5. 日志

```bash
tail -n 200 /var/log/nginx/01PLAYER.access.log
tail -n 200 /var/log/nginx/01PLAYER.error.log
journalctl -u 01aiclub-certbot.service --since '7 days ago'
systemctl list-timers 01aiclub-certbot.timer
```

不要在工单、聊天或公开 Issue 中粘贴完整访问日志；先删除 IP、User-Agent 中的身份信息和任何查询参数。

## 6. 手动回滚

查看可回滚版本：

```bash
static_root=$(cat /etc/01PLAYER/static-root)
find "$static_root/shared/successful" -maxdepth 1 -type f -printf '%f\n' | sort -r
```

以专属用户回滚：

```bash
sudo -u 01aiclub-deploy /usr/local/lib/01aiclub/release.sh --rollback <版本ID>
```

回滚只允许指向已经通过健康检查的版本。不要手工复制文件到 `current`，不要把 `current` 改成普通目录。

## 7. 证书续期

```bash
systemctl status 01aiclub-certbot.timer
systemctl start 01aiclub-certbot.service
certbot certificates --config-dir /etc/letsencrypt-01aiclub
```

定时器每天检查两次。续期成功后自动执行 `nginx -t` 并重载。

2026-11-26 用 DNS-01 续期，源站与阿里云 CDN 的证书指纹一致，有效期至北京时间 2027-02-24 18:34:07。源站 HTTP 和 HTTPS 均配置了 ACME 验证路径，原有 HTTP 自动续期已通过 Certbot 模拟签发。

官网 ECS 的续期服务使用 [CDN 同步配置](../deploy/01aiclub-certbot-cdn.conf) 和 [同步脚本](../deploy/sync-cdn-certificate.py)。每次成功运行续期检查后比较公网与源站的证书指纹，指纹不同时用该 ECS 的 RAM 实例角色同步证书。脚本安装于 `/usr/local/lib/01aiclub/sync-cdn-certificate.py`，续期服务配置安装于 `/etc/systemd/system/01aiclub-certbot.service.d/10-cdn.conf`。运行日志可用 `journalctl -u 01aiclub-certbot.service` 查看。

## 8. 密钥与令牌轮换

### CI SSH 密钥

1. 在本机生成新的 Ed25519 密钥。
2. 把新公钥加上相同的 `restrict,command=...` 前缀。
3. 通过受控初始化更新 `authorized_keys`。
4. 将新私钥编码为单行 Base64，并在云效独立变量组更新 `CLUB_DEPLOY_SSH_KEY_B64`。
5. 运行一次流水线并确认成功后撤销旧公钥。

### 云效只读 PAT

- 当前约定到期日：`2031-09-01`。
- 到期前 30 天创建新的最小权限令牌并更新 macOS 钥匙串。
- PAT 只用于本机读取流水线状态，不用于 CI 发布。
- 泄露时立即在云效个人设置删除，并清除本机钥匙串条目。

## 9. 故障处理

### 502/503/404

1. `nginx -t`。
2. 核对 `/etc/01PLAYER/static-root` 对应目录的 `current` 是否指向 `releases/` 内版本。
3. 检查错误日志。
4. 通过 `--resolve` 在服务器本机复现。
5. 必要时回滚，不直接修改构建产物。

### DNS 不生效

```bash
dig @223.5.5.5 +short CNAME club.01aiedu.com
dig @1.1.1.1 +short CNAME club.01aiedu.com
```

应返回 `club.01aiedu.com.w.kunlunaq.com`。最终 IP 由 CDN 调度。修改后至少等待原 TTL；不要反复新增同名 A 记录。源站仍为 `47.106.14.254`，必要时使用 `--resolve` 直接验证源站。

### 流水线无法发布

- 构建失败：先看固定 Node 下载校验、`npm ci` 与 `npm run build`。
- SSH 失败：核对 `deploy/known_hosts` 指纹、变量组中的 Base64 CI 私钥和流水线解码日志。
- 服务器拒绝：确认公钥带强制命令前缀，且用户为 `01aiclub-deploy`。
- 健康检查失败：查看流水线输出和独立 Nginx 错误日志，线上会自动回滚。

## 10. 变更检查清单

- [ ] 通过 PR 合并到 `main`。
- [ ] 本地 `npm run build` 通过。
- [ ] 云效流水线成功。
- [ ] DNS 的 CNAME 返回目标 CDN，HTTPS 回源到专属 ECS。
- [ ] HTTP 跳转 HTTPS，HTTPS 200。
- [ ] `version.json` 与 Git 提交一致。
- [ ] 另外两个站点仍正常。
- [ ] 未提交任何私钥、PAT、Cookie 或真实 `.env`。

## 11. 安全组与 SSH 基线

### 安全组

- `80/tcp`、`443/tcp`：网站公网入口，允许 `0.0.0.0/0`。
- `22/tcp`：只允许 Workbench `100.104.0.0/16`、云效中国香港构建集群四个官方 `/32` 出口，以及当前管理员的独立 `/32` 地址。
- `3389/tcp`：Ubuntu 不使用，必须保持关闭。
- 管理员公网 IP 变化时，先通过 Workbench 登录并添加新的 `/32`，验证后再撤销旧地址；不要临时恢复 `22/tcp` 的 `0.0.0.0/0`。
- 云效中国香港构建集群出口以[阿里云官方构建集群文档](https://help.aliyun.com/zh/yunxiao/user-guide/build-a-cluster)为准。当前基线为 `47.57.70.87/32`、`47.242.65.197/32`、`47.90.29.115/32`、`47.57.136.136/32`。

### SSH

修改 SSH 前先备份 `/etc/ssh/sshd_config`，并始终先验证再平滑加载：

```bash
sshd -t
systemctl reload ssh
sshd -T | grep -E '^(maxauthtries|permitrootlogin|pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|permitemptypasswords) '
```

有效策略应包含：

```text
maxauthtries 3
permitrootlogin without-password
pubkeyauthentication yes
passwordauthentication no
kbdinteractiveauthentication no
permitemptypasswords no
```

零一玩家受限密钥的连通性可用非发布命令验证；预期结果是成功建立 SSH 后由强制命令主动拒绝，且不上传任何制品：

```bash
ssh -T -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=deploy/known_hosts \
  -i ~/.ssh/id_ed25519_01aiclub_ci_20260901 \
  01aiclub-deploy@47.106.14.254 noop
```

预期输出为“此密钥仅允许零一玩家官网制品发布。”且退出码非零。不要使用真实 `publish` 命令做空载测试。

云安全中心的“使用 SSH 密钥对登录”检查只识别 ECS 控制台绑定的密钥对。本实例使用手工维护的 `authorized_keys`，已基于实际配置做实例级例外；不得改成全局加白。公网 IP 同样只做当前实例的风险接受，因为该 ECS 承载三个公网网站。

## 12. 免费主机监控与报警

本实例使用基础云监控的免费主机监控能力，不开通电话报警、站点监控、自定义监控、Prometheus 或应用监控专家版。

- C++ 云监控 Agent：`argusagent 4.0.0`，服务为 `cloudmonitor.service`。
- 主机指标采集：`loongcollector 3.3.2`，服务为 `loongcollectord.service`。
- 云监控服务关联角色：`AliyunServiceRoleForCloudMonitor`。
- 报警联系组：`零一玩家ECS免费告警`；只配置邮件联系人，不配置手机、短信或电话。
- CPU 使用率：连续 5 分钟达到 `80%` 为警告，达到 `90%` 为严重。
- 内存使用率：连续 5 分钟达到 `80%` 为警告，达到 `90%` 为严重。
- 磁盘使用率：连续 5 分钟达到 `80%` 为警告，达到 `90%` 为严重。
- 实例运行状态：连续 3 分钟监控值大于等于 `1` 为严重；该指标以 `0` 表示正常、非零表示异常。
- 无监控数据：发送报警，避免 Agent 离线或采集链路中断时静默失效。
- 通道沉默周期：`24 小时`，避免持续异常造成报警风暴。

服务器侧检查：

```bash
systemctl is-active cloudmonitor loongcollectord
/usr/local/cloudmonitor/bin/argusagent -v
ps -eo pid,%cpu,%mem,cmd | grep -E '(argusagent|loongcollector)' | grep -v grep
```

控制台侧应确认 Agent 状态为“运行中”，并能看到 CPU、内存和磁盘使用率。邮件联系人必须完成阿里云激活邮件验证；在激活前规则正常计算，但邮件不会送达。首次配置后应在报警历史中确认联系组出现“邮件”通知记录，并确认规则恢复为“正常”。
