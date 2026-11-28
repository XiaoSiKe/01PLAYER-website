import { eventCategories, eventCategory } from './event-categories.mjs';

export const archiveCategories = { ...eventCategories, 'team-building': '团建' };
export const archiveModules = { all: '全部影像', plan: '玩家计划', 'team-building': '零一团建' };

export function archivePhotoMatches(album, photo, category) {
  const kind = archivePhotoCategory(album,photo);
  return category === 'all' || (category === 'plan' ? kind !== 'team-building' : kind === category);
}

export function archivePhotoCategory(album, photo) {
  return album.category === 'team-building' || photo?.category === 'team-building'
    ? 'team-building' : eventCategory(album);
}

export function archiveAlbumMatches(album, category, photos = album.photos || []) {
  if (category === 'all') return true;
  return archivePhotoMatches(album,undefined,category) || photos.some(photo =>
    photo.category !== 'certificate' && archivePhotoMatches(album,photo,category));
}
