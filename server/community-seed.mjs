// Explicitly fictional examples for acceptance testing, never claimed as club history.
export const events = [
  { id: 'weekend-lab', name: '零一周末造物局', subtitle: '让第一个想法，成为第一个作品。', description: '从身边的小问题出发，用一个周末做出能被真实使用的 AI 小工具。面向所有好奇的玩家，不限专业，不要求已有作品。', date: '2026.12.05 — 12.06', status: 'open', type: '共创活动', location: '线上参与', rules: ['个人或 2–4 人组队参加。', '报名后保留报名编号，活动开始前通过所填联系方式通知。', '提交原创作品，说明使用的 AI 工具与开源资源。'], submissionsOpen: false, example: true },
  { id: 'ai-build-sprint', name: '零一 AI 创造挑战赛', subtitle: '把「如果可以」写成「已经实现」。', description: '围绕学习、校园与日常生活，创造一个可运行的 AI 项目。这里可以找到队友、发起招募，也可以提交你的阶段作品。', date: '2026.11.09 — 11.29', status: 'active', type: '创作比赛', location: '线上 · 不限城市', rules: ['每队 1–5 人，可在本场组队招募中寻找伙伴。', '作品需有可访问的演示链接或介绍图片。', '提交后经管理员审核公开；可在截止前修改并重新提交。'], submissionsOpen: true, example: true },
  { id: 'autumn-hack', name: '零一秋日黑客松', subtitle: '比赛落幕，创作继续。', description: '48 小时，从一个想法到一次真实的展示。这里留下本场公开的作品，欢迎继续体验、交流和加入后续共创。', date: '2026.10.24 — 10.25', status: 'ended', type: '黑客松', location: '线上共创', rules: ['本场活动已结束，停止报名与新作品提交。', '以下作品均为审核后公开的活动作品。', '联系作者前，请先阅读项目介绍与招募要求。'], submissionsOpen: false, example: true },
];
export function seedProjects() {
  return [
    ['study-map', '知途 · AI 学习地图', '把零散资料变成有路径的学习计划，让每一步都有方向。', '以课程目标为起点，整理知识点之间的关系，生成可以逐步完成的学习地图。\n\n当前原型关注资料整理、每日任务和复习反馈，下一阶段希望邀请同学一起验证真实学习场景。', 'autumn-hack', '', 'map', '示例玩家 小林'],
    ['echo-notes', '回声笔记', '留住对话里的灵感，把每次讨论变成下一步行动。', '整理会议纪要与个人灵感，按主题回溯重要决定，并让未完成的想法重新浮现。', 'autumn-hack', '', 'echo', '示例玩家 阿澄'],
    ['campus-agent', '校园搭子', '课程、社团与校园日常，一个更懂你的 AI 助手。', '我们正在做一个面向校园日常的轻量助手，连接常见问题与可靠资料。\n\n本场挑战赛希望完成知识检索和移动端体验，欢迎对产品和开发有兴趣的伙伴加入。', 'ai-build-sprint', '', 'orbit', '示例玩家'],
    ['access-lens', '视界 · Access Lens', '用简洁的场景描述，让信息被更多人看见。', '探索多模态 AI 在信息无障碍中的应用。当前是交互概念与原型，不用于医疗或安全关键场景。', null, '开放创新挑战赛（示例）', 'lens', '示例玩家 阿远'],
    ['tiny-garden', '微光花园', '记录今天的小进步，让长期创作生长得更轻松。', '一个自主发起的创作记录工具，用日记与可视化进度帮助玩家持续完成自己的小项目。', null, '', 'garden', '示例玩家 木木'],
    ['prompt-studio', 'Prompt Studio', '把好用的提示词，做成可以分享和复用的工作台。', '管理提示词版本、使用场景与输出样例，帮助小团队交流实践方法。', null, '', 'grid', '示例玩家 白白'],
  ].map(([id, name, summary, description, eventId, externalSource, art, author], i) => ({ id, name, summary, description, eventId, externalSource, art, author, ownerId: i === 2 ? 'demo-player' : `seed-${i}`, imageUrl: '', demoUrl: '', status: 'approved', reviewNote: '', example: true, createdAt: '2026-11-01T00:00:00Z', recruitment: i === 2 || i === 4 ? { roles: '前端开发 / 产品设计', work: '一起打磨核心流程，完成可用的第一版。', requirements: '每周可投入 3–5 小时，愿意主动交流。', contact: '示例联系方式：请替换为作者确认的公开联系渠道。' } : null }));
}
