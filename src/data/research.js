import { siteRows } from '../editorial/content.js';

export const researchUrl = 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzYzNzg5MjMyOQ==&action=getalbum&album_id=4739811477355003905#wechat_redirect';
export const researchThemes = siteRows('researchThemes', [
  { id: 'reading', title: '论文共读', text: '读懂方法，核对假设，把值得继续追问的问题留下来。', verb: '阅读' },
  { id: 'experiment', title: '实验复现', text: '循着开放资料动手尝试，让理解落到实验与记录中。', verb: '验证' },
  { id: 'collaborate', title: '研究共创', text: '带着问题交流，与同伴一起明确下一步的探索方向。', verb: '共创' },
]);
