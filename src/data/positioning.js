import { pagePaths } from './page-paths.js';

export const COMMUNITY_SLOGAN = '让一切，从此刻发生！';
export const COMMUNITY_SLOGAN_EN = 'Let it all happen, starting now!';

const shadowChatPath = '/player/#chat';
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function shadowDestination() {
  if (import.meta.env?.DEV || loopbackHosts.has(globalThis.location?.hostname)) {
    return playerSystemAvailable() ? shadowChatPath : `http://127.0.0.1:4186${shadowChatPath}`;
  }
  return 'https://shadow.01aiedu.com/';
}

export const CORE_ENTRIES = [
  {
    id: 'shadow',
    title: '零一玩家 Shadow',
    description: '一款如影随形的主角式 AI，从极致的个人主义出发，探索以你为中心的软硬件生态。',
    href: shadowDestination(),
  },
  {
    id: 'players',
    title: '玩家计划',
    description: '把「玩家」理念变成具体落地路径：从一场有趣的活动或比赛开始！',
    href: pagePaths.players,
  },
  {
    id: 'plaza',
    title: '共创广场',
    description: '一个用于链接「真实社会需求」与「高级开发玩家」的优质项目广场！',
    href: pagePaths.plaza,
  },
];

export function playerSystemAvailable() {
  return Boolean(import.meta.env?.VITE_PLAYER_ENABLED ||
    (typeof document !== 'undefined' && document.querySelector('meta[name="01player-app"][content="/player/"]')));
}
