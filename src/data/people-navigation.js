import { pioneers } from './pioneers.js';
import { leadership } from './leadership.js';
import { pagePaths } from './page-paths.js';
const leadershipIds = new Set(leadership.map(member => member.id));
export const isLeadershipMember = id => leadershipIds.has(id);
export const pioneerRoster = pioneers.filter(member => !isLeadershipMember(member.id));
export function memberPageLink(id) {
  const path = isLeadershipMember(id) ? pagePaths.leadership : pagePaths.pioneers;
  return `${path}?member=${encodeURIComponent(id)}`;
}
