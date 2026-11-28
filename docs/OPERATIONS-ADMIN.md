# 零一玩家官网后台与报名服务部署

本手册适用于官网发布维护人。网页继续由现有 Nginx 和静态发布制品提供。独立 Node 服务处理报名，Payload 管理后台提供栏目、素材、审核和监测。玩家通过官网填写活动问卷，使用私人回执查询报名结果和票根。

## 服务与数据

| 路径或服务 | 生产入口 | 数据位置 |
| --- | --- | --- |
| 官网页面、带哈希的静态图片、版本 | 当前站点的静态 Nginx 规则 | 原静态发布目录及其 current 指针 |
| 公开社区 API | `/api/community/` → 本机 4173 或现有玩家服务 | `COMMUNITY_DATA_FILE` 存身份、回执密钥和会话，配套的 `.registrations.sqlite` 存报名和审核 |
| 后台、后台 API、Next 资源 | `/admin`、`/cms-api/`、`/_next/` → 本机 4317 | `CLUB_CMS_DATA/cms.sqlite`、`media/`、`manifest.json` |
| 已发布内容 | `/site-content/manifest.json` → 本机 4173 | 同一份 `CLUB_CMS_DATA/manifest.json` |

**已有同域玩家系统时先确认身份来源。** 06 服务通过同一个 `createCommunityApi` 实例解析账号和会话，它的数据目录还包含玩家档案、加密材料与配对的身份文件。当前由 06 持有官网身份时，将本次更新的 05 社区模块与兼容的 06 版本按原先的相邻目录结构一起部署，保留已有 `/player/`、`/api/player/` 和 `/api/community/` upstream。为 06 配置桥接密钥和报名数据目录。4173 单元的社区环境增加 `COMMUNITY_EXTERNAL=1`，只供应静态文件和公开快照。CMS 的 `COMMUNITY_INTERNAL_ORIGIN` 改成该唯一业务 upstream，默认玩家端口为 4186。每个 `community.json` 只能由一个进程持有。测试既有玩家账号仍可登录、打开自己的档案及跳回官网。独立 05 业务模式使用表内 4173 的默认配置。

## 运行栈与报名存储

官网使用 React/Vite 生成静态资源，由 Nginx 和 CDN 提供。报名与账号业务使用 Node.js 24，运营后台继续使用 Next.js 和 Payload。报名保存在社区服务的本机 SQLite，启用 WAL 和完整提交同步。运营后台通过受权限约束的桥接 API 读取同一个服务的报名数据，CMS 自己的 SQLite 存运营账号、草稿和发布历史。报名数据库和社区身份文件须成对保留。备份、校验和恢复见下文。

当前按一台 ECS、一个报名写入进程运行。一次性预发布环境已用 10,000 条历史报名演练 100 人同一出口同时打开活动、提交和取回票根。SQLite 在本机持久盘上满足这次数据规模与恢复要求。若业务需要多台实例同时写入、跨可用区故障切换或更细的恢复点，再迁移至与 ECS 同地域、同 VPC 的阿里云 RDS PostgreSQL 高可用版。切换前应将报名幂等规则、旧回执及身份归属迁移到共享事务模型，并在隔离实例中逐笔比对。

[SQLite WAL](https://www.sqlite.org/wal.html) · [Payload 数据库适配器](https://payloadcms.com/docs/database/overview) · [阿里云 RDS 高可用与容灾](https://www.alibabacloud.com/help/en/rds/product-overview/high-availability-and-disaster-recovery)

## 构建和预发布

1. 从同一已提交版本在与目标机器同架构、同 libc 的 Linux 构建机安装与 CMS 锁定版本一致的 Node 24.22.3，并按 [Node 官方 SHA-256 清单](https://nodejs.org/dist/v24.22.3/SHASUMS256.txt) 核验对应架构的归档。在这个环境安装 CMS 依赖及原生 sharp、SQLite 包。已有独立静态网页流水线继续使用自己的 Node 24.16.0 固定版本。
2. 官网根目录执行 `npm ci`、`npm run test:community`、`npm run build`。通过原有静态发布流程得到带版本与 SHA-256 清单的 dist。CMS 运行 `npm --prefix cms ci` 和 `npm --prefix cms run build`。构建阶段将 `CLUB_CMS_DATA` 指向构建机专用的临时目录，并使用仅用于构建的 `PAYLOAD_SECRET`、`COMMUNITY_STAFF_BRIDGE_SECRET`、`CMS_OWNER_EMAIL` 和 `CMS_OWNER_PASSWORD`。所有生产凭据只在运行时提供。
3. 执行 `deploy/operations/stage-runtime.sh "$PWD" /tmp/01player-release-candidate`，目标为全新目录。脚本校验静态制品，复制业务源码、CMS 构建、数据库迁移和本机 npm 依赖，再从候选目录载入迁移索引及其模块。缺失或为空的迁移会中止打包；数据库升级在切换时执行。Next 缓存使用单独的运行目录。制品内的 `deploy/operations/` 包含与程序配套的单元、配置模板、冒烟及恢复工具。后续安装和验收从这个版本读取。用已有可信传输渠道和校验和把运行时目录交给服务器管理员，安装为 `/opt/01player-runtime/releases/<完整提交号>`，属主为 root。目标机路径 `/opt/node-v24.22.3/bin/node` 和 `npm` 与上述版本对应。运行服务仅对持久目录及缓存有写权限。
4. 预发布机使用自己的域名、环境文件、数据根与脱敏资料，执行下文单元启动、迁移和冒烟流程。核对当前部署的 Nginx 配置、站点静态 root、现有 `/player` 规则及 CDN 规则。本仓已有部署文档中同时出现过 `01PLAYER` 和 `01aiclub` 目录名，实际值从 `nginx -T` 和已验证的 current 指针读取。共享限流区在 `http` 层定义一次，使用限流区的路由只合入官网 HTTPS server。

[运行时制品暂存脚本](../deploy/operations/stage-runtime.sh) · [原静态发布流程](../DEPLOYMENT.md)

## 玩家管理与运营权限

「社区运营」把活动列表和报名审核放在「玩家计划」下，作品审核放在「共创广场」下，活动照片通过「零一时光机」维护。工作台底部可新建玩家计划和共创广场作品。后台录入的作品需填写公开署名，审核通过后展示，退回后可修改并重新提交。项目简介最多 20 字，卡片封面和横幅分别上传且均为必选，另可选填最多 2 张作品展示图。项目链接选填，留空时详情不显示项目按钮。图片保存在社区身份文件同级的 `project-media/` 目录，须随社区数据备份。运营后台可预览未审核图片，访客只能读取审核公开项目的图片。社区代理请求上限为 1,500,000 字节以容纳四张压缩图片，其余接口仍由服务端保留较小的请求上限。

登录后台默认打开「零一运营」。玩家计划的活动列表默认显示全部，可按赛事、沙龙和合作筛选。填写活动时可从本地上传海报，上传后直接回填素材地址。勾选「开放作品提交」并发布后，活动进入进行中时开放投稿。设置了开始时间的报名中活动按北京时间自动进入进行中，设置了结束时间的活动到点停止接受新投稿。未设置开始时间的活动可手动切换为进行中。

「参与与报名」可以选填票根进群二维码。上传、替换或移除二维码随活动发布生效。已通过的报名票根会显示「扫码进群」，保存票根图片时也会包含二维码。

玩家计划的活动列表和共创广场的作品审核列表上方分别有「设置置顶」。可指定第 1、2、3 位，每条记录标记为未置顶或具体位次。保存后官网对应栏目优先展示，空位沿用自动排序。活动下架或作品退出公开状态后，系统释放对应置顶位。

共创广场的优先区空位按项目发布时间补齐，不使用点赞或收藏数量；玩家的互动不会改变已设置的位次，也不会影响空位顺序。「更多项目」的点赞排序仅作用于下方列表。

侧栏底部的「中 / EN」可切换运营界面语言，浏览器保存所选语言。报名审核与作品审核显示各状态的总数，可点击数字所在的筛选项查看对应记录。报名统计按当前场次汇总，包括本页以外的记录。点开记录可查看内容、联系方式与审核操作。

工作台首页的「访问统计」以北京时间展示今日数据、昨日全天数据、七天日均、单日峰值和热门页面占比。折线图可切换页面量和每日去重来源量，最后一段虚线表示今日截至当前。配置源站采集时，指标使用源站页面请求和来源 IP。其余实例使用公开页面上报的栏目与随机浏览器标识，服务端按日散列去重，数据保存在和账号库同名的 `.traffic.sqlite` 文件。统计接口仅向后台工作人员开放。

工作台的「玩家管理」按关键词、身份和状态筛选账号。运营账号和官网账号沿用各自的登录与授权。

| 身份 | 权限 |
| --- | --- |
| 头号玩家 | 运营管理最高权限，可处理日常运营、新增运营账号、更新其凭据，以及停用、恢复官网账号或撤销会话。 |
| 先锋玩家 | 可管理活动、审核报名与作品、维护照片，并查看官网用户资料。 |
| 零一玩家 | 官网注册默认身份，可报名、投稿、收藏和管理自己的资料。 |

已有官网管理员在官网范围内显示为头号玩家，运营后台以运营账号授权为准。社区账号详情的「玩家记录」分为报名记录、发布项目、收藏和喜欢四项，每项均可翻页查看。账号资料、会话操作与最近 30 次管理记录在各自区块显示。作品或报名审核页可按账号 ID 打开详情。免登录官网的提交单独凭私有回执查询。

「零一时光机」默认展示全部活动相册，可按赛事、沙龙、合作、团建或具体场次筛选。后台同时显示官网历史影像和运营上传的照片。「添加照片」可直接上传本地文件，活动分类随所属活动或当前团建入口确定。时光机下方的「零一科研与竞赛」管理官网科研栏目中的获奖证书与比赛现场素材，支持保存草稿和发布。

玩家登录后进入「玩家空间」。参与记录、我的收藏、我的喜欢、玩家资料与账号设置分别切换；资料编辑与修改密码、退出登录分开。玩家可查看自己的项目和报名，收藏与喜欢读取本人对应记录。手机资料卡左侧展示头像和资料，右侧提供四个入口；手机参与记录隐藏报名编号和项目简介。头像随社区身份数据一同备份，头像与大学在本人的玩家空间显示。

工作台的「报名审核」可按场次和审核状态筛选，每页读取 20 条。筛选条件和页码保存在当前网址。官网管理员的「审核管理」也按页读取活动报名。本机使用 1 万条历史报名和 2,000 个关联账号测量运营名单接口，预热后各取 9 次请求的中位数，包含读取响应和解析 JSON 的时间。整份名单为 3,816,121 字节、131.36 毫秒，第一页为 7,515 字节、1.78 毫秒。按场次和待审核状态筛选后共有 3,332 条，第一页为 7,533 字节、1.99 毫秒。

后台和官网共用 `SpecularButton`、`BorderGlow`、主题、字体与表单样式源码。构建 CMS 时需要相邻的官网 `src/`、`public/` 和前端依赖。构建完成后，共用组件和品牌图标随 Next 产物发布。官网报名表、票根和回执列表共用现有主题及按钮组件。

头号玩家可在用户详情确认停用、恢复或撤销登录设备。停用和撤销立即使旧会话失效。恢复后玩家用原密码重新登录，原有档案和投稿保留。玩家自行修改密码也会使各设备重新登录。历史账号缺少注册或登录时间时显示「暂无记录」。

两位负责人同时调整同一个账号时，收到版本冲突的一方可点击「读取最新资料」，查看最近管理记录后重新决定。生产代理应沿用 `common-proxy.inc` 配置的 `X-Real-IP`，让登录服务按实际访客来源统计失败尝试。注册单独计数。

后台鉴权使用运营账号，官网注册不会授予后台权限。在 05 与 06 共存时，沿用上文的唯一身份服务配置，确保官网、玩家系统和 CMS 都连接同一份账号数据。可用 `OPERATIONS_BROWSER=1 npm run test:operations` 在独立临时数据库验证真实注册、后台权限、会话撤销，以及桌面和手机尺寸的后台界面。

运营人员忘记后台密码，可联系头号玩家核实身份。头号玩家可在「玩家管理」打开运营账号并设置新密码，也可通过「新增零一账号」创建头号玩家或先锋玩家账号。

### 集中报名容量验收

在装有 NGINX 的本机使用项目发布运行时 Node 24.22.3，进入官网目录执行 `npm run bench:enrollment`。脚本使用私有临时目录、随机回环端口、正式 SQLite 写入设置和仓库部署用的 NGINX 规则，每档从同一份含 1 万条历史报名的数据开始。10、25、50、75、100 名参与者各用独立连接、联系方式和提交标识，通过同一网络出口同时提交。每档各测直连业务服务及经过 NGINX 的结果，记录首轮状态码、入口拒绝来源、成功请求 P95 和整批完成时间。每份成功回执都要与持久记录对应，并在服务重启后查回；每档另重放一次提交验证幂等性。

现场容量按一次集中到达计算。两个报名入口共用每个来源 110 次的应用突发额度，给 100 名参加者和少量重试留出空间，之后以每分钟 35 次补充额度。持续流量会消耗该额度；耗尽时业务接口返回 429 和下一个可用名额的等待秒数。不同档位使用全新的限流计数，所有测试数据在结束时清理。

2026-11-22 本机验收使用 Node 24.22.3、NGINX 1.27.4 和 SQLite WAL。下表记录同一网络出口的报名请求经 NGINX 后的结果。优化后每档重复三轮，无自动重试。P95 和整批用时取三轮中的最大值，从放行同时提交的客户端开始计时，到读完响应正文为止。

| 同时提交 | 原配置首轮成功 | 新配置每轮成功 | P95 | 整批用时 |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 9 | 10 | 0.04 秒 | 0.04 秒 |
| 25 | 9 | 25 | 0.30 秒 | 0.33 秒 |
| 50 | 9 | 50 | 0.91 秒 | 0.96 秒 |
| 75 | 9 | 75 | 1.51 秒 | 1.58 秒 |
| 100 | 9 | 100 | 2.08 秒 | 2.21 秒 |

原入口拒绝均来自普通写操作的单 IP 配额；原应用直连在 50、75、100 人三档均放行 35 人。优化后直连 100 人三轮整批用时为 73、105、78 毫秒。每次脚本运行还用新的一组 100 人从扫码或活动详情开始，按“打开表单 → 提交报名 → 在线查询本人回执”走完流程，再重启验证。三轮每一步都得到 100 份成功响应。单独用 100 个不同的预置登录会话通过入口检查官网报名，05 与 06 两种业务服务的每个账号都收到自己的一条报名记录。生产容量取决于实际入口、磁盘与流量组合。

脚本在 100 人全流程中也会模拟运营同时翻页。首份报名返回后，CMS 通过内部接口读取该活动已通过名单的第二页，并核对总数及本页记录。本机复测中，上述查询用时 23.2 毫秒，返回 20 条，总数 10,000。100 名参加者均成功打开表单、提交并查到本人的回执，服务重启后也全部可查。

2026-11-23 更换路由配置后再次通过本机 Nginx 复测。50 人首轮全部成功，整批 0.953 秒。100 人首轮全部成功，整批 2.204 秒，P95 为 2.080 秒。100 人均完成开表、提交和回执查询，重启后逐份核对通过。同时读取一万条历史报名的第二页用时 17.3 毫秒。独立运行 `python3 scripts/operations-nginx.test.py` 可用本机 Nginx 和临时 TLS 证书核对两种数据持有模式、静态回退及业务入口未启用时的 503 响应。

## 首次配置

创建系统用户及目录。以下命令在预发布或正式 Linux 的管理员会话中，从候选发布目录运行。先用 `nginx -T` 和正在运行的服务确认哪一项服务持有已有账号、报名及回执。将 `community_owner` 设为 `standalone`（独立 05）或 `player`（06 持有社区数据）。下面的配置会将报名请求送给该持有者，CMS 的 `COMMUNITY_INTERNAL_ORIGIN` 也须使用同一 `http://127.0.0.1:端口`。两个服务的 systemd 单元启动前会读取 Nginx 选择的地址。如果 CMS 指向另一份名单，或独立社区单元的写入模式与该地址冲突，对应单元会报告相关变量并停止启动。当前已有业务服务时，先保留现有配置副本并核对差异。

```bash
case "${community_owner:-}" in
  standalone|player) ;;
  *) echo '先按实际持有报名数据的服务设置 community_owner=standalone 或 community_owner=player' >&2; exit 1 ;;
esac
id 01player-runtime >/dev/null 2>&1 || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin 01player-runtime
install -d -m 0755 /opt/01player-runtime/releases /etc/01player-runtime
install -d -m 0700 -o 01player-runtime -g 01player-runtime /var/lib/01player-runtime /var/lib/01player-runtime/community /var/lib/01player-runtime/cms /var/cache/01player-cms
install -m 0644 deploy/operations/*.service /etc/systemd/system/
install -m 0644 deploy/operations/traffic-zones.conf /etc/nginx/conf.d/019-01player-traffic.conf
install -m 0644 "deploy/operations/community-$community_owner.inc" /etc/01player-runtime/community-upstream.inc
install -m 0644 deploy/operations/common-proxy.inc deploy/operations/locations.inc /etc/01player-runtime/
for name in bridge community cms; do
  test -e "/etc/01player-runtime/$name.env" || install -m 0600 "deploy/operations/$name.env.example" "/etc/01player-runtime/$name.env"
done
systemctl daemon-reload
```

- 在 `bridge.env` 设置两个后端共同使用的随机 `COMMUNITY_STAFF_BRIDGE_SECRET` 与持久目录。新装独立 05 在 `community.env` 设置初始社区管理员邮箱和强密码。CMS 在单独的 `cms.env` 设置 `PAYLOAD_SECRET`、负责人邮箱和强密码。两个密钥分别生成，备份到获授权者可恢复的密码库。系统级环境文件限 root 读取。后续替换负责人密码使用后台账号管理。
- 已有正式社区 JSON 时停掉原持有进程，先备份，再将经过校验的文件迁入指定位置并设为服务账号可写。建空新库只适用于首次启用的空环境。正式模式使用 `NODE_ENV=production`、`COMMUNITY_DEMO=0`。
- 新版 HTTPS 模板在官网 server 内载入 `/etc/01player-runtime/enabled/*.conf`。业务服务就绪后，建立 `/etc/01player-runtime/enabled/`（0755），将 `operations.conf` 作为指向 `/etc/01player-runtime/locations.inc` 的符号链接放入该目录。启用前，静态模板对报名、后台和内容快照请求返回不可缓存的 503。官网其它页面照常访问。
- 已有定制 HTTPS 配置的站点，保留原配置，在官网 HTTPS server 中只接入一份业务路由。原来已经直接 include `locations.inc` 的站点继续使用该入口。原有完全相同的 `location ^~ /api/community/` 需合并为一份。06 配套的 `/api/(community|player)/` 正则可与更具体的社区规则共存。保留已有 ACME、TLS、静态和玩家路由。两种模式下内容快照都从 4173 读取。仅在 `nginx -t` 成功后受控重载，随后核对公众端和后台读取的是同一场活动。
- CMS 上传总大小上限为 18 MiB，含 multipart 开销，CMS 单文件上限为 16 MiB。社区 JSON 请求上限为 64,000 字节。CDN 为后台、身份及报名 API、内容快照和带预览参数的 HTML 配置不缓存并转发 Cookie/POST。
- 上线前确认 `nginx -T` 中 `conf.d/*.conf` 在 `http` 层载入。核对现有 realip 配置只信任当前 CDN 回源网段，并用两个已知不同网络的访问验证源站解析到各自的客户端地址。源站用这个地址覆盖传给后端的 IP 请求头。未还原访客地址时，同一 CDN 节点会共用一个写入配额。
- 官网免登录报名和账号报名共用独立预算。初始全站每秒 64 次、突发余量 112 次，每个来源每秒 40 次、突发余量 104 次。配额空闲时，全站前 16 次、同一来源前 12 次可立即转发，随后 Nginx 按速率陆续放行，允许同一场地的用户同时点击。最多 64 个报名请求同时进入处理阶段。超过突发余量或并发上限时返回带 `Retry-After: 1` 的 429。
- 活动目录、活动详情和扫码开表单共用公开读取预算。私人回执查询使用独立读取预算。两个预算各允许全站每秒 100 次、每个来源每秒 80 次，突发余量分别为 120 和 112，每组最多同时处理 32 个请求。回执仍由社区服务验签并按凭据限流。社区所有路由合计最多同时处理 80 个请求。
- 常规社区请求、后台、Next 静态资源和公开快照各自按每秒 200 次、64 个处理中请求计数。常规社区写入另有全站每秒 24 次、每个来源每秒 6 次的预算，密码操作按社区和后台分别限制为每秒 6 次。静态官网继续使用现有 CDN 缓存。预发布时对照实际业务延迟、CPU、内存以及 Nginx 日志中的限流区名称调整这两份配置。[NGINX 请求速率限制](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html) · [并发限制](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html)
- 只读云监控从 ECS RAM 角色获取，运营页的 `OPS_ECS_INSTANCE_ID`、`OPS_ECS_ROLE`、磁盘和网卡维度须与实际资源对应。外部及源站 Gatus 实例 URL、令牌和云效只读凭据按已有监控填写，启用后设置 `OPS_MONITORING_ENABLED=1`。在本地或没有凭据时会显示未接入。保留主机已有基础监控与告警设置。

## 活动报名入口与组队招募

活动类型统一为「赛事、沙龙、合作」，前台分类和后台类型筛选保持相同顺序。合作沿用 activity 存储编码，无需迁移旧目录；卡片、详情、参与按钮及影像归档按同一映射展示。

活动编辑的「报名入口」可选「官网报名」或「外部链接」。官网报名支持直接确认和运营审核，并生成本站票根；外部报名需填写完整 HTTP(S) 地址，发布后活动信息栏的「参与赛事／参与沙龙／参与合作」打开该地址。未填写地址可保存草稿，发布时必须补齐。外部报名不接收本站的新报名记录，切换前已提交的票根和同一提交的重试仍保留。

报名表分别保存电话号码和微信，后台审核分别展示。电话作为去重联系方式，历史联系方式记录继续兼容。已报名用户通过本机票根或账号报名记录直接打开原回执；顶部「我的报名」位于账号按钮左侧。

报名中及进行中的已发布活动均可通过共用入口报名，遵守报名截止时间及活动结束时间。组队招募在报名中、进行中开放，结束或下架后停止新增招募。招募简介最多 30 字，卡片按项目名、招募标题、简介排列，点击后进入独立招募详情。活动影像入口仅在已结束活动展示。详情操作栏的招募与分享使用相同样式。电脑端活动信息及项目信息保持固定，手机端正常滚动。完整验收可使用 `EVENT_ENTRY_BROWSER=1 node scripts/operations-integration.mjs`，该演练使用独立临时数据库和账号。

## 攻略内容运营

2026-11-27 策略调整后，官网 `/earth` 的目录与文章由运营后台 `/admin/guide` 管理。目录名称、文章顺序、Markdown 正文、作者、大学和上传日期均可在后台编辑。每个目录的第一篇为开篇，文章上方的目录链接返回该篇。首页文件夹按宽屏最多五列排列；文章的本章目录从 Markdown 标题自动生成，发布正文后随之更新，无需另行维护。

「保存草稿」保留未公开的修改，「预览草稿」保存后打开仅运营可见的页面，「发布攻略」更新公开内容。后台沿用网站栏目的 SQLite 草稿与版本记录，发布快照通过原子替换写入 `CLUB_CMS_DATA/manifest.json`。同一份快照经 `/site-content/earth-guide.json` 提供给官网。刷新页面即可读取新发布内容，已打开页面定期检查更新。编辑版本过期时返回冲突提示，避免覆盖其他运营人员的修改。

官网服务不再读取 Skill 仓库、本地 Skill 目录或 GitHub 分支。Skill 下载及源码链接作为独立工具入口保留，内容如需同步，由运营手动复制到后台。`cms/src/content/earth-guide-seed.json` 仅用于首次创建官网攻略栏目，已有后台数据不会被初始内容覆盖；`npm run cms:prepare` 从该文件生成初始栏目配置。

备份时连同 CMS SQLite、密钥与发布快照一起备份，恢复后由已发布版本重新建立快照。验证命令为 `node --test scripts/earth-guide-sync.test.mjs scripts/editorial-content.test.mjs`，完整后台演练为 `GUIDE_BROWSER=1 node scripts/operations-integration.mjs`。

以下发布记录保留为旧策略的历史验收。当前这次后台内容管理调整仅在本地预览，尚未上线。

### 2026-11-27 发布验收

官网发布版本为 `57641b247f93a71fa1713c56510d63a74fbd9ef6`，通过现有受限静态通道发布；攻略快照服务从 `/opt/01player-runtime/releases/guide-57641b247f93` 运行。新路由已经安装，Nginx 配置检查和公开业务冒烟通过。此前版本 `ecf1afed3b3f637ef5d4e13651b06e1f42bfa543` 保留用于恢复。

攻略目录 PR [#4](https://github.com/XiaoSiKe/01player-earth-survival-guide/pull/4) 已合并。随后合并开篇文章 PR [#5](https://github.com/XiaoSiKe/01player-earth-survival-guide/pull/5)，官网保持原版本且未刷新页面，自动显示新正文和 2026-11-27 上传日期，快照版本变为 `566dd93a601b18293b0ef51d924a8b35fc62efff`。已验证桌面、手机、分组开篇和前后篇跳转。

生产服务器的原始文件域名连接被重置，正文改由 GitHub Contents API 的 raw 响应读取。首次上线时云效仍返回 1400003，使用受限通道发布。随后确认云效保留了更名前的 GitHub 代码源，已在控制台更新至 01PLAYER-website/main。重跑流水线 #60 成功，合并文件夹目录 PR #62 又自动触发 #61，GitHub 完整验收通过。后续文章同步独立于官网代码发布。

### 2026-11-27 自动发布与文件夹目录验收

已将云效代码源从更名前的仓库地址更新为 `XiaoSiKe/01PLAYER-website`。重跑原失败工作流成功后，PR [#62](https://github.com/XiaoSiKe/01PLAYER-website/pull/62) 和 [#63](https://github.com/XiaoSiKe/01PLAYER-website/pull/63) 合并分别自动触发云效 #61、#62。两次 GitHub Actions 均在核对正式版本后成功，最后正式提交为 `b541bd7ca77d3bddb3cabe4d2bdb210a407c2476`。

最终发布记录为 [GitHub Actions 45942273620](https://github.com/XiaoSiKe/01PLAYER-website/actions/runs/45942273620)。正式页桌面深色和手机浅色的文件夹展开、文章入口、毛玻璃样式、无横向溢出均通过。生产构建另验证了减少透明度时的实色回退。攻略 Markdown 继续通过原有内容接口同步。

### 2026-11-27 文件夹同排与文章可读性优化

PR [#64](https://github.com/XiaoSiKe/01PLAYER-website/pull/64) 合并后自动触发云效 #63，正式版本为 `57ec356039c5e6d9dea7c9816f7604dc7a5c0593`。[发布检查](https://github.com/XiaoSiKe/01PLAYER-website/actions/runs/45945490958) 已通过。正式页验证了 1440px 深色、1024px 浅色的三个文件夹同排，以及 390px 手机布局。文章卡片完整展示，标题多行点击区域、开篇与文章跳转均通过。上线前另验证了长标题、四篇分组、依次入场、键盘焦点和减少动态效果。公开业务冒烟通过。

## 切换与验收

以下示例假定运行时已按完整提交号放入 `releases`。变更前记下旧的两个 current 指针。使用原有发布工具单独切换该提交对应的静态制品。静态接收端拒绝本地工作区快照，并将源站返回的版本、首页、Logo 及抽查的 JS、CSS 与制品逐字节核对。资源返回首页也会触发静态回退。

```bash
set -e
release_id=填入已验收的完整提交号
test -s "/opt/01player-runtime/releases/$release_id/cms/.next/BUILD_ID"
test "$(/opt/node-v24.22.3/bin/node -p 'require(process.argv[1]).commit' "/opt/01player-runtime/releases/$release_id/dist/version.json")" = "$release_id"
ln -s "releases/$release_id" "/opt/01player-runtime/.candidate-$release_id"
systemctl stop 01player-cms.service 01player-community.service
# 已有业务数据时，在此执行下文的 backup 和 verify。保持两项服务停止，直至迁移完成。
mv -Tf "/opt/01player-runtime/.candidate-$release_id" /opt/01player-runtime/current
systemctl start 01player-cms-migrate.service
systemctl enable --now 01player-community.service 01player-cms.service
nginx -t && systemctl reload nginx
REQUIRE_PRODUCTION=1 /opt/node-v24.22.3/bin/node /opt/01player-runtime/current/deploy/operations/smoke.mjs https://club.01aiedu.com "$release_id"
```

在终端逐步执行，迁移有错误即停在该步。迁移单元运行 CMS 已提交的 schema 迁移，完成后启动 CMS，并由其建立初始负责人和栏目。目录需保存完整的 `cms/src/migrations`。修改 schema 的发布须先在恢复出的预发布数据上验证升级。Nginx 与云效静态流水线继续使用原有受限发布密钥。运行时由服务器管理员独立安装，不扩大该密钥权限。

用负责人在预发布上传一张图片，打开详细信息查看缩略图，进入一个栏目替换引用，保存草稿后确认游客看到旧图，预览确认新图后发布。检查桌面与移动端使用的尺寸，进入素材信息核对引用位置。再建一场审核制活动，配置一道必答题并发布，在官网提交后在工作台审核，刷新回执。正式切换只运行只读冒烟。首次业务验收通过后，将 GitHub 仓库 Actions 变量 `CLUB_REQUIRE_BUSINESS` 设为 `1`，后续 main 发布在确认静态版本后自动复验正式域名的报名接口、登录页与后台权限。报名、资料或素材的写入演练留在预发布数据。

## 备份与恢复

正式 Node 24 初次启动新版时，把旧 JSON 中的报名逐条导入同目录的 `community.json.registrations.sqlite`，事务提交后才切换索引文件。旧回执的编号和签名密钥沿用。切换前先停写并备份，预留可同时容纳旧 JSON、新数据库和 WAL 的磁盘空间。每套社区数据由一个业务进程持有，使用本机持久卷。升级后需连同报名库备份。下面的工具会把已提交报名合并到备份 JSON，恢复出的目录可重新迁移。单独回切到读取旧 JSON 的代码前，须先从对应恢复点取得完整报名数据。

完整的业务快照包含报名、密钥关联、回执、CMS SQLite 和媒体文件。独立 05 部署的运行数据按本手册位于 `/var/lib/01player-runtime/{community,cms}`。备份工具通过 SQLite 备份 API 合并已提交 WAL，并对每个文件做 SHA-256 校验。运行时停写使图片、公开 manifest、CMS 和报名数据处在同一恢复点。密钥环境文件通过运维现有私密备份渠道另存。只备份代码制品不足以恢复业务。

```bash
systemctl stop 01player-cms.service 01player-community.service
snapshot=/var/backups/01player-runtime/$(date -u +%Y%m%dT%H%M%SZ)
deploy/operations/snapshot.py backup /var/lib/01player-runtime "$snapshot" --release "$(basename "$(readlink -f /opt/01player-runtime/current)")"
deploy/operations/snapshot.py verify "$snapshot"
systemctl start 01player-community.service 01player-cms.service
```

恢复演练使用新目录。工具核对实际复制到暂存目录的每个文件与快照清单的 SHA-256，并校验数据库，再将恢复目录交付。备份与恢复目标须在源目录之外，工具会解析父目录的符号链接，并拒绝覆盖已有目标。确认处于停写窗口、目标磁盘空间充足；为恢复目录恢复运行账号拥有权，保留旧数据为独立留存副本。改变环境文件中的绝对路径时，同步调整 systemd 的 `ReadWritePaths`，并执行 `systemctl daemon-reload`。更便捷的原路径恢复方式是在同一文件系统准备新目录、两项服务停止时将旧目录改名归档，再把新目录改名到原位置。用备份对应的运行时及静态版本启动并验收，检查素材、回执和已有会话。

```bash
restored=/var/lib/01player-runtime-restore-20261122
deploy/operations/snapshot.py restore "$snapshot" "$restored"
chown -R 01player-runtime:01player-runtime "$restored"
```

若 06 是唯一身份与社区数据持有者，使用 06 的配套维护命令保留玩家 SQLite、密钥和身份的对应关系；不要从独立 05 的空目录恢复玩家身份。先暂停外部写入并停止 CMS，在同一维护窗口取得 06 的一致备份及已停止的 CMS 数据目录副本（含 SQLite WAL 和媒体），联合记录恢复点和两个代码版本，按 06 的恢复工具在全新目录演练，再恢复 CMS。静态版本可按原成功制品回滚。运行时与 schema 兼容时仅回切代码指针；不兼容时需先评估备份之后的新报名和发布数据，保留故障现场，协调恢复窗口后再按匹配快照恢复。[玩家系统维护手册](../../06-零一玩家系统/README.md)

在「团建」分类点击「添加照片」，新照片归入团建目录并保留所属活动关联。团建是时光机影像分类。
