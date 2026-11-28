import { getActivityPhotos } from '../data/activity-photos.js';
import { competitionItems } from '../data/competition.js';
// Reuse verified local assets and captions; do not invent event dates.
const siteActivityPhotos = getActivityPhotos().map(item => ({ ...item, category: 'activity', image: item.src, fullImage: item.src, aspectRatio: item.width / item.height }));

export const historicalTimeMachineAlbums = [
  { eventId: 'history:kaiwu', category: 'competition', name: '开物·福州高校黑客松',
    photos: siteActivityPhotos.filter(photo => photo.title === '开物·福州高校黑客松' && photo.organization?.startsWith('零一黑客松｜')) },
  { eventId: 'history:first-team-dinner', category: 'team-building', name: '「零一」首次聚餐耍起',
    photos: siteActivityPhotos.filter(photo => photo.organization === '日常活动｜「零一」首次“聚餐耍起”') },
  ...[...new Set(siteActivityPhotos.filter(photo => photo.organization?.startsWith('零一团建｜')).map(photo => photo.organization))].map(organization => ({
    eventId: 'history:team:' + organization.slice('零一团建｜'.length), category: 'team-building', name: organization.slice('零一团建｜'.length),
    photos: siteActivityPhotos.filter(photo => photo.organization === organization),
  })),
  ...[
    ['business-review', 'AI 商业锐评会'],
    ['research-review', 'AI 科研锐评会'],
    ['first-ai-salon', '梦开始的地方'],
    ['campus-club-fair', '福州大学社团巡礼'],
  ].map(([id, name]) => ({
    eventId: 'history:' + id, category: 'salon', name,
    photos: siteActivityPhotos.filter(photo => photo.organization === `零一沙龙｜${name}`),
  })),
].filter(album => album.photos.length);

export const timeMachinePhotos = [
  ...siteActivityPhotos,
  ...competitionItems.filter(item => item.kind === 'photo').map(item => ({ ...item, category: 'competition', organization: '比赛现场' })),
];

export const historicalPhotoId = photo => 'history-photo-' + photo.id;
const assignedPhotos = new Set(historicalTimeMachineAlbums.flatMap(album => album.photos.map(historicalPhotoId)));
export const historicalArchiveAlbums = [
  ...historicalTimeMachineAlbums,
  ...['activity', 'competition'].map(category => ({
    eventId: 'history:other:' + category, category,
    name: category === 'competition' ? '比赛现场' : '历史影像',
    photos: timeMachinePhotos.filter(photo => photo.category === category && !assignedPhotos.has(historicalPhotoId(photo))),
  })).filter(album => album.photos.length),
].map(album => ({ ...album, id: album.eventId, historical: true }));
export const historicalArchivePhotos = historicalArchiveAlbums.flatMap(album => album.photos.map(photo => ({
  ...photo, id: historicalPhotoId(photo), eventId: album.id, imageUrl: photo.image,
})));
