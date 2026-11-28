import { pagePaths } from './page-paths.js';
import { siteRows } from '../editorial/content.js';
const home = { id: 'top', label: '首页', ariaLabel: '返回首页', link: '#top' };
const sections = [
  { id: 'about', label: '关于我们', ariaLabel: '了解零一玩家', link: '#about' },
  { id: 'work', label: '我们在做什么', ariaLabel: '我们在做什么', link: '#work' },
  { id: 'directions', label: '零一玩家生态', ariaLabel: '了解社区正在开展的方向', link: '#directions' },
  { id: 'business', label: '零一商业', ariaLabel: '浏览零一商业', link: '#business' },
  { id: 'research', label: '零一科研与竞赛', ariaLabel: '浏览零一科研与竞赛', link: '#research' },
  { id: 'partners', label: '零一合作生态', ariaLabel: '浏览合作品牌', link: '#partners' },
  { id: 'cooperation', label: '零一高校分社', ariaLabel: '浏览零一高校分社地图', link: pagePaths.cooperation },
  { id: 'join', label: '欢迎加入零一', ariaLabel: '查看加入我们的说明', link: pagePaths.join },
];

const oldTitles = { directions: ['我们在做什么'], join: ['加入我们', '欢迎加入「零一玩家」'] };
const publishedMenu = siteRows('menu', [home, ...sections]);
const publishedSections = publishedMenu.flatMap(item => {
  const section = sections.find(entry => item.id ? entry.id === item.id : entry.link === item.link);
  if (!section || !item.label?.trim()) return [];
  return [{ ...section, ...item, id: section.id,
    label: oldTitles[section.id]?.includes(item.label) ? section.label : item.label }];
});

export const menu = [home, ...publishedSections];
