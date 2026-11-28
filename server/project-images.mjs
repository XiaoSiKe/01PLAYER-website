import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, url } from './community-input.mjs';

import { PROJECT_IMAGE_LIMIT } from './project-images-limit.js';
export function projectImages(project) {
  return [project.imageUrl, project.bannerUrl, ...(project.showcaseImages || [])].filter(Boolean);
}

function jpegSize(bytes) {
  if (bytes.length < 8 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return null;
  for (let offset = 2; offset + 4 <= bytes.length && bytes[offset] === 0xff;) {
    const marker = bytes[offset + 1], length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xda || length < 2 || offset + 2 + length > bytes.length) return null;
    if ([0xc0,0xc1,0xc2].includes(marker)) return length >= 8 ? [bytes.readUInt16BE(offset + 5),bytes.readUInt16BE(offset + 7)] : null;
    offset += 2 + length;
  }
  return null;
}

export function projectImage(value, label, directory) {
  if (!value) return '';
  if (typeof value !== 'string') fail(400, `${label}格式无效。`);
  if (/^\/api\/community\/project-media\/[a-f0-9]{64}\.jpg$/.test(value)) return value;
  if (!value.startsWith('data:')) return url(value, label);
  const data = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)?.[1];
  const bytes = data && Buffer.from(data, 'base64');
  const size = bytes && jpegSize(bytes);
  if (!directory || !bytes || value.length > PROJECT_IMAGE_LIMIT || bytes.toString('base64') !== data ||
      !size || size.some(edge => edge < 1 || edge > 2048)) fail(400, `${label}无效，请重新上传图片。`);
  const filename = createHash('sha256').update(bytes).digest('hex') + '.jpg';
  mkdirSync(directory, {recursive:true,mode:0o700});
  writeFileSync(join(directory,filename), bytes, {mode:0o600});
  return '/api/community/project-media/' + filename;
}
