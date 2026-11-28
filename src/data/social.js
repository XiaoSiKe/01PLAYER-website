import { siteRows } from '../editorial/content.js';
// Reuse the club's existing social destinations. No video-channel URL was supplied.
export const socialChannels = siteRows('socialChannels', [
  { id: 'douyin', title: '抖音', href: 'https://v.douyin.com/9F_YljWXWZI/' },
  { id: 'xiaohongshu', title: '小红书', href: 'https://xhslink.cn/o/3n2GfFKLJps' },
  { id: 'bilibili', title: 'B站', href: 'https://b23.tv/MKzBvaS' },
  { id: 'channels', title: '视频号', href: '' },
]);

export const telegramChannel = { id: 'telegram', title: 'Telegram', href: 'https://t.me/AI01YangAI' };

export const extraFooterLinks = siteRows('extraFooterLinks', [
  {
    "id": "telegram",
    "title": "Telegram",
    "href": "https://t.me/AI01YangAI",
    "image": ""
  },
  {
    "id": "club",
    "title": "零一玩家",
    "href": "https://club.01aiedu.com/",
    "image": ""
  },
  {
    "id": "github",
    "title": "GitHub",
    "href": "",
    "image": ""
  },
  {
    "id": "x",
    "title": "X",
    "href": "https://x.com/01yang2026?s=11",
    "image": ""
  },
  {
    "id": "feishu",
    "title": "飞书",
    "href": "https://scn96l2kzmbn.feishu.cn/wiki/DDaiw0qKoifo7jkd2H2c9mxhnYe",
    "image": ""
  },
  {
    "id": "founder",
    "title": "零一玩家智能科技",
    "href": "https://www.01yang.space/",
    "image": ""
  },
  {
    "id": "qq",
    "title": "QQ",
    "href": "https://qun.qq.com/universal-share/share?ac=1&authKey=Y6PHDoQm%2BSNy%2Bdr0SJTyHZ7Vt2jQfwQCR6sidHUatABcMNltCtupL24cigSRxTYc&busi_data=eyJncm91cENvZGUiOiI5NjY2NTQ2MzMiLCJ0b2tlbiI6IllLUmVXNXM4WS8zMG1MRHlGeFFkUUd4M0R1ZG8wekpXMVB1a0N2dkhubVp6KzF5b2xOVjRKakxFZHQ4Q3dCRFQiLCJ1aW4iOiIxNzg1ODY3NzkyIn0%3D&data=-Yz2JZMQgTAM5BkEf9Vrw9lDLH6BkX2nFl4-tH8ska8WC6OQPqpmTcvM5f24z7x5jSg--p3b18JBNtQeMn3Tzg&svctype=4&tempid=h5_group_info",
    "image": ""
  }
]);
