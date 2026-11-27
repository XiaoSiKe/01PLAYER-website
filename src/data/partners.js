import { siteRows } from '../editorial/content.js';
// Names and assets were supplied by the club. Verified official destinations
// and asset provenance are recorded in public/images/partners/SOURCES.md.
// Entries without a confirmed destination remain display-only.
// Optical sizes balance wordmarks, icon/name pairs, and the original vertical lockup.
export const partners = siteRows('partners', [
  { id: 'xcombinator', category: 'community', name: 'XCombinator', src: '/images/partners/xcombinator.png', artwork: { width: 2172, height: 724, darkInk: { x: 580 } }, width: 192, height: 64 },
  { id: 'huawei-cloud', category: 'community', href: 'https://www.huaweicloud.com/', name: '华为云', src: '/images/partners/huawei-cloud.svg', darkSrc: '/images/partners/huawei-cloud-dark.svg', width: 124, height: 43.63 },
  { id: 'linkathon', category: 'hackathon', name: 'Linkathon', src: '/images/partners/linkathon-original.jpg', width: 96, height: 60.9, artwork: { viewBox: '150 205 1135 720', width: 1400, height: 1280, cutout: true, adaptNeutral: true } },
  { id: 'minkesong', category: 'hackathon', name: '闽客松', src: '/images/partners/minkesong-bright.png', width: 128, height: 55.52, offsetY: -5 },
  { id: 'shenkesong', category: 'hackathon', name: '深客松', src: '/images/partners/shenkesong.png', darkBrightness: 1.15, width: 129.6, height: 46.386 },
  { id: 'hackflows', category: 'hackathon', name: 'HackFlows', src: '/images/partners/hackflows.png', darkSrc: '/images/partners/hackflows-dark.png', crop: { viewBox: '52 52 1064 118', width: 1168, height: 222 }, width: 192, height: 21.29 },
  { id: 'fluxtech-nankesong', category: 'hackathon', name: 'FluxTech 南客松', src: '/images/partners/fluxtech-nankesong.png', darkSrc: '/images/partners/fluxtech-nankesong-dark.png', width: 210, height: 54.94 },
  { id: 'zhongyuan', category: 'hackathon', name: '中源黑客松', src: '/images/partners/zhongyuan.svg', artwork: { viewBox: '39 231 1732 575', width: 1845, height: 1080, cutout: true, adaptNeutral: true }, width: 182.4, height: 60.553 },
  { id: 'adventure-x', category: 'hackathon', href: 'https://www.adventure-x.cn/zh/', name: 'Adventure X', src: '/images/partners/adventure-x.png', invertOnLight: true, width: 210, height: 32.66 },
  { id: 'nextstep', category: 'hackathon', href: 'https://portal.nextstep.org.cn/', name: 'NextStep', src: '/images/partners/nextstep.svg', darkSrc: '/images/partners/nextstep-white.svg', width: 210, height: 24.48 },
  { id: 'emerge', category: 'hackathon', name: 'Emerge', src: '/images/partners/emerge.svg', darkSrc: '/images/partners/emerge-white.svg', width: 144, height: 36.24 },
  { id: 'bayhack', category: 'hackathon', href: 'https://bayhack.cn/', name: '大湾区黑客松 BayHack', src: '/images/partners/bayhack.png', darkSrc: '/images/partners/bayhack-dark.png', width: 210, height: 40.27 },
  { id: 'codeland', category: 'community', href: 'https://gocodeland.cn/', name: '上岛计划 CodeLand', src: '/images/partners/codeland.svg', darkSrc: '/images/partners/codeland-dark.svg', width: 173.28, height: 28.040675 },
  { id: 'atomhub', category: 'community', name: '原子公社 AtomHub', src: '/images/partners/atomhub.svg', invertOnDark: true, width: 157.5, height: 57.51 },
  { id: 'r7-community', category: 'community', name: 'R7社区', src: '/images/partners/r7-community.png', width: 64.638, height: 57.6 },
  { id: 'qutansuo', category: 'community', href: 'https://qutansuo.cn/', name: '去探索', src: '/images/partners/qutansuo.png', invertOnLight: true, width: 144, height: 39.73 },
  { id: 'yubing', category: 'community', name: '语冰', src: '/images/partners/yubing.png', width: 122, height: 49.84 },
  { id: 'fuzhou-ai-learning', category: 'community', name: '福州 AI 共学社', src: '/images/partners/fuzhou-ai-learning.svg', darkSrc: '/images/partners/fuzhou-ai-learning-dark.svg', width: 168, height: 48.14 },
  { id: 'jiko', category: 'community', name: 'JIKO', src: '/images/partners/jiko.png', invertOnDark: true, width: 150, height: 47.13 },
  { id: 'atomcraft', category: 'community', name: '原子游创 AtomCraft', src: '/images/partners/atomcraft.svg', darkSrc: '/images/partners/atomcraft-dark.svg', width: 152, height: 54.42 },
  { id: 'molispark', category: 'community', name: '摩力创境 Molispark', src: '/images/partners/molispark.svg', width: 136, height: 49.95, offsetY: '3pt' },
  { id: 'oral-english-association', category: 'university', name: '英语口语协会', src: '/images/partners/oral-english-association.png', darkSrc: '/images/partners/oral-english-association-dark.svg', width: 133.11, height: 48.492 },
  { id: 'fzu-lean-club', category: 'university', name: 'FZU薄肌俱乐部', src: '/images/partners/fzu-lean-club.svg', width: 52, height: 52, showName: true },
  { id: 'wzu-open-source-club', category: 'university', name: '温州大学开源社', src: '/images/partners/wzu-open-source-club.svg', width: 52, height: 52, showName: true },
]);

export const partnerCategories = [
  { id: 'community', title: '社区合作伙伴' },
  { id: 'university', title: '高校合作伙伴' },
  { id: 'hackathon', title: '黑客松合作伙伴' },
];
