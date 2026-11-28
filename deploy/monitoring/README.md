# 零一玩家运行监测

运营后台的「零一运维」聚合阿里云 CloudMonitor、Gatus、活动数据服务以及云效的只读结果。默认关闭远程查询。开启后后台对同一轮结果缓存 30 秒，主机和探针采样超过 5 分钟显示「数据已过期」。

## 部署监测点

采用 [Gatus v5.38.0](https://github.com/TwiN/gatus/releases/tag/v5.38.0)。两个实例独立使用持久化 SQLite。配置挂载到容器的 `/config/config.yaml`，数据卷挂载到 `/data`。以下命令针对 Linux Docker。启动前请按各自位置准备持久化目录，将配置放在对应主机。用实际镜像的运行用户授予其专用数据目录写权限。

**公网探针**部署在官网 ECS 以外的主机，建议在社区用户所在的中国内地网络，可以使用已有独立运行节点。公网探针通过 DNS/CDN 访问正式域名，验证 DNS、TLS、首页和返回结构化 JSON 的活动接口。配置位于 `edge.yaml`。

```sh
docker run -d --restart unless-stopped --name 01player-edge-monitor --network host \
  -v "$PWD/edge.yaml:/config/config.yaml:ro" -v 01player-edge-history:/data \
  ghcr.io/twin/gatus:v5.38.0
```

**源站探针**部署在官网 ECS。使用 host 网络，并仅在这个容器内将官网域名指向回环地址，从而带正确 SNI 访问本地 Nginx。它可单独发现源站证书未续期。配置位于 `origin.yaml`。

```sh
docker run -d --restart unless-stopped --name 01player-origin-monitor --network host \
  --add-host club.01aiedu.com:127.0.0.1 \
  -v "$PWD/origin.yaml:/config/config.yaml:ro" -v 01player-origin-history:/data \
  ghcr.io/twin/gatus:v5.38.0
```

两个探针分别只监听回环端口 8088 和 8089。后台可直接读取同机探针，远端探针通过已有私网隧道转发到本机端口，或经带身份验证的 HTTPS 网关提供状态。探针数据库和管理员接口应限制在私网。预期 CDN CNAME 改变时，应同步更新 `edge.yaml`。证书探测阈值为 7 天。

无需 Docker 的源站可用同版本 Linux Gatus 二进制与 [systemd 单元](01player-gatus-origin.service)。该单元只为探针挂载独立 hosts 文件，将官网域名解析到源站回环地址，并把 SQLite 历史存到独立的状态目录。

macOS 管理机上的公网探针使用 `cn.01player.monitor-edge` LaunchAgent 启动工作区 `.local/operations/gatus/` 中的既有 Gatus、配置和 SQLite 历史。探针随登录启动，异常退出时由 launchd 重启，状态 API 监听本机 `127.0.0.1:8088`。若运营后台的五项公网检查都提示探针未响应，先查看 `launchctl print gui/$(id -u)/cn.01player.monitor-edge`，再核对本机端口和 API 中的最新采样。

## CMS 服务端配置

| 环境变量 | 用途 |
| --- | --- |
| `OPS_MONITORING_ENABLED` | 设置为 `1` 后启用。可分别接入各个来源 |
| `OPS_GATUS_EDGE_ORIGIN` | CMS 可访问的外部观测点服务基址，如经过安全隧道映射的 `http://127.0.0.1:8088` |
| `OPS_GATUS_ORIGIN_ORIGIN` | 源站观测点服务基址，如 `http://127.0.0.1:8089` |
| `OPS_GATUS_EDGE_TOKEN`、`OPS_GATUS_ORIGIN_TOKEN` | 服务前有 Bearer 鉴权网关时设置，凭据仅传给对应网关 |
| `OPS_SITE_ORIGIN` | 要核验发布版本和活动服务的站点基址，正式环境用 `https://club.01aiedu.com`。若缺省则读取 `COMMUNITY_INTERNAL_ORIGIN` |
| `OPS_ECS_INSTANCE_ID`、`OPS_ECS_REGION` | 有现有 CloudMonitor Agent 的 ECS 实例和地域，地域默认 `cn-shenzhen` |
| `OPS_ECS_ROLE` | 当前服务器绑定的只读 RAM 实例角色名。SDK 通过 IMDSv2 取得短期凭据 |
| `OPS_ECS_TARGETS` | 多实例时填写 JSON 数组。每项含 `id`、`name`、`region`，可填 `disk` 和 `network`。只读角色须能查询列出的实例 |
| `OPS_DISK_DEVICE`、`OPS_NETWORK_DEVICE` | CloudMonitor 对应指标实际返回的磁盘、网卡 device 维度，请从该实例已有监控记录中选取 |
| `YUNXIAO_ORGANIZATION_ID`、`YUNXIAO_PIPELINE_ID`、`YUNXIAO_TOKEN` | 对应官网云效流水线的组织、流水线 ID 和专用只读令牌。通过 CMS 服务环境提供 |
| `YUNXIAO_TOKEN_KEYCHAIN_SERVICE` | macOS 预览的既有云效只读令牌服务名。提供 `YUNXIAO_TOKEN` 时优先使用环境中的值 |
| `OPS_SOURCE_HOST`、`OPS_SOURCE_SSH_KEY`、`OPS_SOURCE_KNOWN_HOSTS` | 在管理机运行本地预览时使用已有管理员通道。指定核对后的源站、私钥绝对路径和固定主机公钥清单绝对路径 |

管理机预览通过既有 SSH 通道在源站执行 [只读快照脚本](source-snapshot.py)。流量与运维分别读取并缓存 45 秒。流量统计只读取官网访问日志，缓存到期后可先显示当天最近快照，再在后台更新。运维使用 ECS 实例角色读取 CloudMonitor，并读取同机 Gatus。访问看板标明「源站日志」，展示实际命中源站的页面请求和来源 IP 数，排除 Gatus 和本机回环探测。命中 CDN 缓存的请求不在源站日志统计口径内。后台页面的浏览器采集沿用站点发布时启用的采集端点。

CloudMonitor 的 `DescribeMetricList` 接口对应 RAM 操作 `cms:QueryMetricList`。该操作需要账号级资源范围 `*`，采集目标由服务配置中的实例 ID 和设备维度决定。使用实例已有的 RAM 角色时，在其权限中补充这一只读操作。每项显示约 30 分钟的实测值，网卡是所选主机设备的总吞吐量。CPU、内存及磁盘连续 5 个一分钟采样达到 80% 时标为异常。现有阿里云邮件报警继续执行既有策略。[CloudMonitor RAM 授权](https://help.aliyun.com/en/cms/cloudmonitor-1-0/developer-reference/api-cms-2019-01-01-ram) · [主机指标](https://help.aliyun.com/zh/cms/cloudmonitor-1-0/user-guide/overview-of-basic-and-operating-system-monitoring)

先在本地运行 `node --test cms/src/ops/monitor.test.mjs`。对接后由管理员核对每个项目的数据来源、采样时间和探针观测位置，分别确认 CDN 和源站探针。活动探针仅读取服务身份和持久化可访问状态；名单、联系方式、私钥和云凭据不会出现在看板。
