import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail, text } from './community-input.mjs';
import { isPublished, mediaUrl } from './player-events.mjs';
import { reconcileEventArchives } from './event-links.mjs';
import { historicalArchivePhotos } from '../src/time-machine/photos.js';

const historicalById = new Map(historicalArchivePhotos.map(photo => [photo.id, photo]));

export function photoView(photo) {
  return { ...photo, imageUrl: photo.image };
}

export function savePhoto(db, input, id, publicRoot) {
  const saved = id ? db.photos.find(item => item.id === id) : null;
  const historical = historicalById.get(id);
  const current = saved || historical;
  if (id && !current) fail(404, '照片不存在。');
  if (current && input.eventId != null && current.eventId !== input.eventId) fail(400, '请在原活动专题中编辑照片。');
  const eventId = current?.eventId || input.eventId;
  if (!historical) {
    const event = db.events.find(item => item.id === eventId);
    if (!event) fail(404, '活动不存在。');
    reconcileEventArchives(db);
    if (!isPublished(event) || !db.albums.some(album => album.eventId === eventId)) fail(409, '请在已发布且已开始的活动专题中添加或修改照片。');
  }
  const cleanImage = mediaUrl(input.imageUrl ?? current?.image ?? '');
  if (!cleanImage) fail(400, '请选择活动照片。');
  if (cleanImage.startsWith('/images/') && !existsSync(resolve(publicRoot, '.' + decodeURIComponent(cleanImage)))) fail(400, '本地照片不存在。');
  if (db.photos.some(photo => photo.id !== id && photo.eventId === eventId && photo.image === cleanImage)) fail(409, '这张照片已在本场专题中。');
  const category = historical?.category ?? input.category ?? current?.category;
  if (!['activity', 'competition', 'team-building', 'certificate'].includes(category)) fail(400, '请选择照片分类。');
  const fullImage = cleanImage === current?.image ? current.fullImage || cleanImage : cleanImage;
  const record = { ...saved, id: current?.id || 'event-photo-' + randomUUID(), eventId, image: cleanImage, fullImage, category,
    title: text(input.title ?? current?.title,'照片说明',250), credit: text(input.credit ?? current?.credit ?? '', '摄影署名',100,false),
    createdAt: current?.createdAt || new Date().toISOString() };
  if (id) record.updatedAt = new Date().toISOString();
  if (saved) {
    db.photos[db.photos.indexOf(saved)] = record;
  } else db.photos.push(record);
  return photoView(record);
}

export function historicalPhotoEdits(db) {
  return db.photos.filter(photo => historicalById.has(photo.id))
    .map(({ id, image, fullImage, title, credit }) => ({ id, image, fullImage, title, credit }));
}
export function removePhoto(db, id) {
  const index = db.photos.findIndex(photo => photo.id === id);
  if (index < 0) fail(404, '照片不存在。');
  db.photos.splice(index,1);
  return { ok: true };
}
