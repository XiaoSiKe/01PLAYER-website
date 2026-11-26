import { siteRows } from '../editorial/content.js';

const defaultDestinations = [
  {
    "id": "wiki",
    "title": "零一开源知识库",
    "href": "https://scn96l2kzmbn.feishu.cn/wiki/DDaiw0qKoifo7jkd2H2c9mxhnYe"
  },
  {
    "id": "partners",
    "title": "合作生态介绍",
    "href": "https://scn96l2kzmbn.feishu.cn/wiki/X7h6wI8SCiAuZAkpYF2caNv7nTG"
  },
  {
    "id": "recruitment",
    "title": "社团招募计划",
    "href": "https://scn96l2kzmbn.feishu.cn/wiki/C06Pw29bDiA6I2kZy7ecsbcZnag"
  },
  {
    "id": "wordmark",
    "title": "页脚官网标识",
    "href": "https://club.01aiedu.com/"
  },
  {
    "id": "icp",
    "title": "ICP备案查询",
    "href": "https://beian.miit.gov.cn/"
  },
  {
    "id": "police",
    "title": "公安备案查询",
    "href": "https://beian.mps.gov.cn/#/query/webSearch?code=35011102351280"
  },
  {
    "id": "earth",
    "title": "「零一玩家」地球生存攻略",
    "href": "https://earth.01aiedu.com/"
  },
  {
    "id": "strategy",
    "title": "战略、架构与发展",
    "href": "https://scn96l2kzmbn.feishu.cn/wiki/Pw4FwagW6iPaVqkzyeNc7rRSnub"
  },
  {
    "id": "branch-plan",
    "title": "分社参与计划",
    "href": "https://scn96l2kzmbn.feishu.cn/wiki/PIqKwgPI7iIrtXkHps9cqavKn4c"
  }
];
export const siteDestinations = siteRows('siteDestinations', defaultDestinations);
const links = new Map([...defaultDestinations, ...siteDestinations].map(row => [row.id, row.href]));
export const siteDestination = id => links.get(id);
