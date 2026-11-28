# 零一玩家｜01PLAYER 官网

### 这里是「零一玩家｜01PLAYER」！

> **一个以大学生为主要群体、面向全社会开放的「AI 共创社区」！**
>
> **我们把现实生活看作一个开放的世界游戏：「地球Online：零一玩家」，每个人都是自己故事的主角！**
>
> **我们带着「玩家」的勇气与好奇心，在实践中不断探索与成长，完成自己的从零到一！**

### 「零一玩家」主要在做什么？

1. **「零一玩家 Shadow」：一款如影随形的主角式 AI，从极致的个人主义出发，探索以你为中心的软硬件生态。**
2. **「玩家计划」：把「玩家」理念变成具体落地路径：从一场有趣的活动或比赛开始！**
3. **「共创广场」：一个用于链接「真实社会需求」与「高级开发玩家」的优质项目广场！**

### 「零一玩家」成立于 2026.9.1，我是社长，零一扬！

> **让一切，从此刻发生！**

[访问官网](https://club.01aiedu.com/) · [反馈问题](https://github.com/XiaoSiKe/01PLAYER-website/issues) · [参与贡献](./CONTRIBUTING.md)

## 本地开发

React + Vite。Node.js 版本见 [`.nvmrc`](./.nvmrc)。

```bash
npm ci
npm run dev
```

打开终端显示的地址。

官网和 Shadow 共用会话时，从上一级目录启动[联合开发入口](../开发交接.md)。

## 官网与运营后台一起预览

使用 `cms/.nvmrc` 指定的 Node 24.22.3，在本目录运行：

```sh
npm ci
npm ci --prefix cms
npm run dev:all
```

浏览器打开[玩家计划](http://127.0.0.1:5173/players)、[共创广场](http://127.0.0.1:5173/plaza)或[运营后台](http://127.0.0.1:5173/admin)。首次本地启动会建立 `operator@01player.test` 负责人账号，将一次生成的随机密码存入 `.local/operations/preview-password`。可在首次启动前用 `CMS_OWNER_EMAIL` 和 `CMS_OWNER_PASSWORD` 指定本地负责人。后台支持按栏目改图文、素材上传、活动草稿和发布、报名及作品审核、专题相册与系统监测。网站读取最近一次已发布的内容，在后台维护期间仍能浏览。

玩家在官网活动详情填写报名表，在「我的报名」查看带撕线和圆缺口的票根。[正式部署、备份与恢复](docs/OPERATIONS-ADMIN.md)和[监测接入](deploy/monitoring/README.md)包含服务端配置。`npm run test:operations` 使用独立临时数据演练真实后台的迁移、上传和报名审核。

攻略在[攻略运营](http://127.0.0.1:5173/admin/guide)管理目录、Markdown 文章、作者、大学和上传日期，支持草稿预览及发布。官网内容以后台为准，与独立 Skill 仓库分开维护。

玩家在[官网账号页](http://127.0.0.1:5173/plaza?view=account)登录、查看身份和修改密码。运营在[玩家管理](http://127.0.0.1:5173/admin/community-users)按关键词、角色和状态查找账号。负责人可停用、恢复玩家账号或退出全部设备，也可新增管理员及更新其凭据。

### 一笔报名怎样流转

| 环节 | 代码与数据 |
| --- | --- |
| 选活动 | 运营发布场次。官网列表读取已发布活动，点进某场只读取该场的完整介绍和问卷。 |
| 提交 | 官网为一次提交保存幂等键。社区服务校验问卷后写入报名 SQLite，返回编号和私人回执凭据。网络中断可用原键重试。 |
| 审核与查票 | 运营在「报名审核」按场次和状态分页读取名单。官网凭私人回执查询最新审核结果，确认后显示票根。免登录回执保存在本机，账号报名也可在玩家空间查看。 |
| 部署与恢复 | 公众报名和运营后台连接同一个社区服务。恢复时一起核对身份、回执签名密钥、报名库与 CMS 数据。 |

社区接口与历史数据兼容用 `npm run test:community` 核验。跨端完整流程用 `OPERATIONS_BROWSER=1 npm run test:operations`，发布与恢复用 `npm run test:deployment`。100 人并发的复测命令是 `npm run bench:enrollment`，需要本机 Nginx。官网报名与票根的独立浏览器回归用 `npm run test:registration:browser` 运行。

## 检查与构建

```bash
npm run test:runtime
npm run build
npm run preview
```

## 文档

- [贡献指南](./CONTRIBUTING.md)
- [设计规范](./DESIGN.md)
- [部署说明](./DEPLOYMENT.md)
- [运维手册](./docs/OPERATIONS.md)
- [图片与性能](./docs/IMAGE-PERFORMANCE.md)

## 使用范围

仓库尚未声明开源许可证。代码与品牌资源用于其他项目前，须取得授权。

<!-- 社区简介依据：2026-11-23 确认的对外介绍；品牌与第三方素材按各自授权使用。 -->
