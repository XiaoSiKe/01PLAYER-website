import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail, text } from './community-input.mjs';
import { isPublished, mediaUrl } from './player-events.mjs';

export function photoView(photo) {
  return { ...photo, imageUrl: photo.image };
}

export function savePhoto(db, input, id, publicRoot) {
  const current = id ? db.photos.find(item => item.id === id) : null;
  if (id && !current) fail(404, '照片不存在。');
  if (current && input.eventId != null && current.eventId !== input.eventId) fail(400, '请在原活动专题中编辑照片。');
  const eventId = current?.eventId || input.eventId;
  const event = db.events.find(item => item.id === eventId);
  if (!event) fail(404, '活动不存在。');
  if (!isPublished(event) || !db.albums.some(album => album.eventId === eventId)) fail(409, '请在已发布且已开始的活动专题中添加或修改照片。');
  const cleanImage = mediaUrl(input.imageUrl ?? current?.image ?? '');
  if (!cleanImage) fail(400, '请选择活动照片。');
  if (cleanImage.startsWith('/images/') && !existsSync(resolve(publicRoot, '.' + decodeURIComponent(cleanImage)))) fail(400, '本地照片不存在。');
  if (db.photos.some(photo => photo.id !== id && photo.eventId === eventId && photo.image === cleanImage)) fail(409, '这张照片已在本场专题中。');
  const category = input.category ?? current?.category;
  if (!['activity', 'competition', 'certificate'].includes(category)) fail(400, '请选择照片分类。');
  const record = { ...(current || {}), id: current?.id || 'event-photo-' + randomUUID(), eventId, image: cleanImage, fullImage: cleanImage, category,
    title: text(input.title ?? current?.title,'照片说明',250), credit: text(input.credit ?? current?.credit ?? '', '摄影署名',100,false),
    createdAt: current?.createdAt || new Date().toISOString() };
  if (current) {
    record.updatedAt = new Date().toISOString();
    db.photos[db.photos.indexOf(current)] = record;
  } else db.photos.push(record);
  return photoView(record);
}
export function removePhoto(db, id) {
  const index = db.photos.findIndex(photo => photo.id === id);
  if (index < 0) fail(404, '照片不存在。');
  db.photos.splice(index,1);
  return { ok: true };
}
