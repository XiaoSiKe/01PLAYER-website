import { projectImage } from './project-images.mjs';
import { fail, text, url } from './community-input.mjs';

export function recruitment(input) {
  if (!input) return null;
  return Object.fromEntries([['roles', '希望招募的伙伴'], ['work', '参与内容'], ['requirements', '具体要求'], ['contact', '公开联系方式']]
    .map(([key, label]) => [key, text(input[key], label, 1500)]));
}

export function projectFields(input, eventId, imageDirectory) {
  const summary = text(input.summary, '项目简介', 20);
  const images = input.showcaseImages ?? [];
  if (!Array.isArray(images) || images.length > 2 || images.some(value => typeof value !== 'string' || !value)) fail(400, '作品展示图最多上传 2 张。');
  const demoUrl = url(input.demoUrl, '演示链接');
  if (typeof input.imageUrl !== 'string' || !input.imageUrl.trim()) fail(400, '请选择卡片封面。');
  if (typeof input.bannerUrl !== 'string' || !input.bannerUrl.trim()) fail(400, '请选择项目横幅。');
  const fields = {
    name: text(input.name, '项目名称', 80), summary,
    description: text(input.description, '项目介绍', 12000), demoUrl, eventId,
    externalSource: eventId ? '' : text(input.externalSource || '', '外部活动名称', 100, false),
    recruitment: recruitment(input.recruitment),
  };
  return {
    ...fields,
    imageUrl: projectImage(input.imageUrl.trim(), '卡片封面', imageDirectory),
    bannerUrl: projectImage(input.bannerUrl.trim(), '横幅', imageDirectory),
    showcaseImages: images.map(value => projectImage(value, '作品展示图', imageDirectory)),
  };
}
