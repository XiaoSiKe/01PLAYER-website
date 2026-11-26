import { siteRows } from '../editorial/content.js';
import { sharedPortrait } from './member-portraits.js';
import { pioneers, stockPortraitById } from './pioneers.js';

// The seven people and their posts follow the club's six-system organization plan.
// The wall distributes each row across three columns, starting with club leadership.
const roster = [
  { id: 'XiaoSiKe', name: '零一扬', role: '社长' },
  { id: 'CurvatureSoup', name: 'xyh', role: '技术开发部部长' },
  { id: 'qwq2008123-star', name: 'Keal', role: '商务拓展部部长' },
  { id: 'xy821178142gxy-web', name: 'Gabi', role: '副社长' },
  { id: 'dh108888', name: 'DH', role: '运营公关部部长' },
  { id: 'miracle-fjnu', name: 'Miracle', role: '人力组织部部长' },
  { id: 'Dirgerx', name: '王云重', role: '副社长' },
];

export const leadership = siteRows('leadership', roster.map(member => {
  const profile = pioneers.find(pioneer => pioneer.id === member.id);
  return {
    ...member,
    photo: profile?.photo,
    photoPlaceholder: !profile?.photo,
    photoFit: profile?.photoFit,
    focus: profile?.focus,
    href: profile?.href,
    joinedAt: profile?.joinedAt,
    founding: profile?.founding,
    university: profile?.university,
  };
})).map(member => {
  const photo = sharedPortrait(member.name, member.id, member.photo, stockPortraitById[member.id]);
  return photo === member.photo ? member : {...member, photo, photoPlaceholder: !photo};
});
