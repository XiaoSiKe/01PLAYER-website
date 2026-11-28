# 零一玩家官网上线前验收

检查日期：2026-11-28（Asia/Shanghai）。范围为官网与运营后台；Shadow 不在本次范围。

本次以用户正在预览的工作区为基线，保留此前尚未合并的功能和界面。检查过程未调整页面布局、样式、动效、图片或组件文案；唯一前台内容修复是补齐繁体语言包的「正在保存…」。代码先通过 PR 合并，生产发布保持暂停，等待用户复核。

## 已修复的问题

| 编号 | 问题与处理 | 验证 |
| --- | --- | --- |
| F-release-hold | main 原先检查后直接发布。新增默认关闭的 `CLUB_AUTO_DEPLOY` 门禁，工作流和触发脚本双重检查；发布任务依赖官网与后台两个检查任务成功。 | 缺省、`0`、`true` 均不读取发布密钥、不请求云效。仓库变量已设为 `0`，原生 GitHub Webhook 保持停用。 |
| F-upload-dependencies | 后台图片解码库存在高危公告，嵌套净化库与迁移工具也有告警。升级 sharp 0.34.5 → 0.35.5、DOMPurify 3.4.15 → 3.5.0，并限定旧迁移工具使用修复后的 esbuild。 | 两套生产依赖审计均为 0 项；干净安装、实际图片上传、迁移及后台构建通过。React、Payload、Next 与 Monaco 版本保持原值。 |
| F-guide-revalidation | 未变化的攻略检查请求仍重复解析、校验和序列化全部正文。按已发布快照复用唯一响应表示，仅发布版本变化时重建。 | 相同样本的内容版本完全一致；原子更新、删除、错误版本隔离、恢复、GET/HEAD/304 回归通过。 |
| F-i18n-generated | 繁体语言包漏生成保存票根的进行中提示。 | 补齐缺项并保留人工译文；生成器仅转换新增内容，移除退役键。语言包键集合、插值、跨语言搜索、人工译文保留和生成幂等测试通过。 |
| 测试维护 | 攻略元信息已折叠，旧测试未展开；相册请求新增查询参数后旧拦截未命中；图片测试曾依赖 sharp 内部路径。 | 按真实界面展开资料、拦截完整接口、使用 sharp 正式包入口。完整浏览器流程重跑通过。 |

安全依据：[sharp 发布者公告](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)、[DOMPurify 发布者公告](https://github.com/cure53/DOMPurify/security/advisories/GHSA-hrxw-jjj6-2g2j)。依赖审计反映检查当天的公开数据库，并不等于不存在未公开问题。

## 功能覆盖

测试写入使用独立临时账号和数据库，不替换本机或生产报名数据。

| 范围 | 实际检查 |
| --- | --- |
| 公开页面 | 生产制品逐页打开首页、玩家计划、共创广场、攻略、导师、团队、先锋、战略、合作、加入、时光机、科研及项目/活动详情、账号入口；桌面和手机检查脚本异常、资源错误与横向溢出。 |
| 首页交互 | 手机导航、栏目、文件夹、合作生态、地图搜索、分社列表、页脚；桌面与手机、深浅主题的横版 Logo 入场动效。 |
| 活动 | 赛事/沙龙/合作分类、状态和截止时间、官网与外部报名、进行中报名、招募、作品入口、投稿活动预选、桌面信息固定与手机滚动。 |
| 报名与票根 | 四类问卷、必填校验、免登录与账号报名、幂等键、丢包重试、多页去重、待审/通过/未通过、刷新恢复、活动来源返回、票根群二维码及保存。 |
| 账号 | 注册、登录、昵称/头像/大学、密码修改、会话撤销、停用恢复、跨页退出、切换账号时的写入保护与草稿隔离、公开主页。 |
| 项目与招募 | 必选封面/横幅、选填两张展示图、上传压缩与重启持久化、审核前图片私密、审核后公开、点赞/收藏、来源与作者跳转、招募及返回来源。 |
| 攻略 | 目录/文章排序、作者/大学/日期、Markdown 层级与重复标题锚点、目录返回开篇、前后篇、右侧目录、手机文件夹；后台新建、保存、预览、发布、删除与冲突保护。 |
| 运营 | 负责人/运营/访客权限、用户目录与分页、运营密码重置限制、自身权限保护、工作队列、活动与项目编辑审核、置顶、专题照片、素材引用与历史版本保护。 |
| 数据与恢复 | 报名 SQLite 迁移、身份配对、只读名单分页、持久化失败、备份恢复、发布包安全解压及失败回滚测试。 |
| 代理与并发 | 正式 Nginx 模板路由、上传限额、gzip/HEAD、缓存；10/25/50/75/100 人提交及完整报名链路、后台一万条记录分页。 |

## 可重复执行的检查

- `npm run test:runtime`：49 项通过。
- `npm run test:community`：81 项通过。
- `npm run test:deployment`：18 项通过。
- `node --test cms/src/ops/*.test.mjs scripts/editorial-content.test.mjs`：21 项通过。
- `npm run build`：1007 个静态文件校验通过。
- `OPERATIONS_BROWSER=1 GUIDE_BROWSER=1 EVENT_ENTRY_BROWSER=1 node scripts/operations-integration.mjs`：真实 CMS 迁移、生产构建、权限、上传、发布、报名审核及三个浏览器流程通过。请使用 `cms/.nvmrc` 指定的 Node。
- 独立浏览器脚本：`check-web-registration`、`check-community-accounts`、`check-community-pages`、`check-project-images`、`check-guide-navigation`、`check-detail-returns`、`check-activity-submission`、`check-event-categories`、`check-mobile-polish`、`check-preview-interactions`、`check-branded-entrance`，均位于 `scripts/`。
- `npm run test:release:browser`：从生产制品启动独立业务服务，覆盖公开路由及冷启动采样。
- `npm run test:operations:browser`：本机编辑器控件、上传入口、冲突与响应丢失恢复；实际业务写入由测试拦截隔离。
- `npm run bench:guide`：攻略条件请求性能样本。
- `npm run bench:enrollment`、`python3 scripts/operations-nginx.test.py`：需要 Nginx。本次在一次性 Linux 容器内执行，未在宿主机安装 Nginx。
- `npm audit --omit=dev`、`npm audit --prefix cms --omit=dev`：生产依赖告警均为零。

## 性能记录

### 攻略版本检查

本机 Node 24.16.0，同一 60 篇、正文共 3,024,000 字节的有效攻略；顺序发起 100 次带 ETag 的请求，去掉前 10 次，比较其余 90 次。请求经过真实 HTTP 接口，均返回 304。

| 条件请求 | 调整前 | 调整后 |
| --- | --- | --- |
| P50 | 12.57 ms | 0.25 ms |
| P95 | 14.22 ms | 0.72 ms |

响应内容版本在两次测试均为 `9ca07034e33776f02bd30f74dc498a47ea80695c40130b987c2d576374d82f17`。缓存仅保留当前有效快照，不累积历史正文；错误新版本不会退回旧内容冒充成功。

### 报名并发与首页

带 10,000 条历史报名的一次性容器样本：100 人直连提交全部成功，P95 为 443.6 ms；经 Nginx 提交全部成功，P95 为 2109.1 ms。完整的打开活动、提交、读取票根各 100 次均成功，且逐条核对入库。后台第二页 20 条响应为 106.1 ms。容器使用 Docker Linux amd64，在本机 Apple Silicon 上存在模拟开销；这些数据不能推导生产容量上限。

本机 Chrome、1440×900 和 390×900、禁用缓存、1.6 Mbps 下载/150 ms 延迟/CPU 降速四倍的单次冷启动采样：首屏照片准备与预加载释放检查通过，两个视口的帧间隔 P95 均约 16.7 ms；采样窗口最大长任务分别 198 ms 和 208 ms。没有提前请求人脸模型，折叠线下复杂模块保持延迟挂载。此处记录同条件观察，不作所有设备不卡顿的保证。

## 代码与数据归属

| 唯一职责 | 维护入口 |
| --- | --- |
| 页面入口、路径分派 | `src/main.jsx`、`src/data/page-paths.js` |
| 站内来源返回、账号身份和受保护操作 | `src/community/account/` |
| 官网账号、项目、点赞收藏、公开身份 | `server/community-api.mjs`；身份和业务快照 `community.json` |
| 报名记录、幂等与私有票根 | `server/community-registrations.mjs`；配套 SQLite 与身份/回执密钥共同备份 |
| 活动状态、报名截止、分类、运营路由 | `server/event-state.mjs`、`player-events.mjs`、`player-event-routes.mjs` |
| 运营角色、栏目草稿、素材、发布历史 | `cms/src/payload.config.ts`、`cms/src/content/`；CMS SQLite |
| 官网已发布内容与攻略 | `CLUB_CMS_DATA/manifest.json` → `server/editorial-snapshot.mjs` / `earth-guide.mjs`；后台是内容来源，独立 Skill 仓库不参与自动同步 |
| 静态资源、运行打包、备份与切换 | `deploy/`；发布暂停规则见[运维手册](OPERATIONS.md#2-日常发布) |

官网与运营使用同一个被选定的社区业务服务；不可启动第二个进程同时写同一身份文件。社区账号与运营账号有各自的授权边界，工作人员通过受限桥接访问业务接口。公开主页不返回登录邮箱、私人报名联系方式或票根凭据。

## 文件整理与保留

- 本次移除无用途的 Finder 索引，重建依赖升级后失效的本地后台编译缓存；临时测试数据、日志与锁文件试验集中在系统临时目录，验收后清理。
- 合并此前已从工作区移除的微信小程序交接代码、旧远端攻略传输代码、本地内置文章副本；已确认当前源码、后台和脚本无剩余引用。官网攻略初始种子保留在 CMS。
- 已整理的旧 Logo 试稿及过期预览不重新放回官网；正式品牌副本、来源说明、原始图片、旗帜与历史验收档案保留。`deliverables/README.md` 继续作为素材入口。
- `.local/` 的真实本机账号、报名、密钥与 CMS 数据，正在使用的构建缓存和依赖均保留，不提交到 Git。
- `scripts/` 保留可重复的功能、恢复与性能检查；本报告保存结论，避免沉淀大量无用途的测试截图。

## 发布边界与待验证项

本次未上传发布制品，未运行云效发布或切换生产服务，未修改 Shadow。生产业务数据迁移、真实域名下的新版报名/票根、CDN 与线上监测连接需在用户同意部署后验收。外部活动报名表只验证跳转地址，不代替用户向第三方提交报名。邮件验证和邮箱自助找回当前未接入，沿用现有账号方案，未把它们写成已支持功能。

当前发布开关 `CLUB_AUTO_DEPLOY=0`；原生 GitHub Webhook `672788547` 停用。检查开始时线上版本为 `340d817a8dc7dc15a101be3018030c4ed2f74887`、云效最近运行 #65。合并后须再次核对这两项不变，并核对 main 工作流的发布任务为 skipped。
