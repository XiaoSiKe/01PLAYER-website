import { PeopleRosterPage } from './PioneersPage';
import { leadership } from './data/leadership';

const SEARCH_LABELS = {
  search: '头号玩家姓名搜索',
  input: '搜索头号玩家成员姓名',
  placeholder: '搜索姓名',
  results: '匹配的头号玩家成员',
  empty: '没有找到相关头号玩家',
};

export default function LeadershipPage() {
  return <PeopleRosterPage members={leadership} heading={'头号\n玩家'} pageTitle="头号玩家 · 零一玩家"
    skipLabel="跳到头号玩家" rosterLabel="头号玩家成员肖像墙" searchLabels={SEARCH_LABELS}
    className="leadership-page" columns={3} tabletColumns={3} portraitScale={0.924} repeatWithinColumn />;
}
