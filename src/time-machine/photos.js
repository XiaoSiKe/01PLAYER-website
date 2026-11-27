import { activityPhotos } from '../data/activity-photos.js';
import { competitionItems } from '../data/competition.js';
// Reuse verified local assets and captions; do not invent event dates.
export const timeMachinePhotos = [
  ...activityPhotos.map(item => ({ ...item, category: 'activity', image: item.src, fullImage: item.src, aspectRatio: item.width / item.height })),
  ...competitionItems.map(item => ({ ...item, category: item.kind === 'certificate' ? 'certificate' : 'competition', organization: item.kind === 'certificate' ? '获奖记录' : '比赛现场' })),
];
