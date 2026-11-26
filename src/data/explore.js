import { siteRows } from '../editorial/content.js';

const albumUrl = id => `https://mp.weixin.qq.com/mp/appmsgalbum?__biz=MzY5ODQ2MDMyMw==&action=getalbum&album_id=${id}#wechat_redirect`;

export const learningFolderItems = siteRows('learningFolderItems', [
  { id: 'thinking', title: '零一文章', href: albumUrl('4716921209454706690') },
  { id: 'partnerships', title: '零一合作', href: albumUrl('4797998250400268293') },
]);

export const practiceFolderItems = siteRows('practiceFolderItems', [
  { id: 'hackathon', title: '玩家计划', href: albumUrl('4716922803005014019') },
  { id: 'plaza', title: '共创广场', href: albumUrl('4716921710573371394') },
  { id: 'team-events', title: '零一团建', href: albumUrl('4716908909473677313') },
]);
