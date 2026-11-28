import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dir } from '../env.mjs';

const blankManifest = () => ({ sections: {}, copy: {}, assets: {}, images: {} });
const mediaIndex = new Map();
export function manifest() {
  const path = resolve(dir, 'manifest.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : blankManifest();
}
function referencedImages(sections) {
  const images = {};
  function visit(value) {
    if (typeof value === 'string' && mediaIndex.has(value)) images[value] = mediaIndex.get(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  visit(sections);
  return images;
}
export function mergeSection(base, key, rows) {
  const sections = { ...base.sections, [key]: rows };
  const result = { ...base, sections, images: referencedImages(sections) };
  if (key.startsWith('copy-')) {
    result.copy = Object.fromEntries(
      Object.entries(sections)
        .filter(([k]) => k.startsWith('copy-'))
        .flatMap(([, items]) =>
          items
            .filter((r) => r.zh || r.hant || r.en)
            .map((r) => [r.source, { 'zh-Hans': r.zh, 'zh-Hant': r.hant, en: r.en }]),
        ),
    );
  }
  if (key === 'siteAssets')
    result.assets = Object.fromEntries(
      rows.filter((r) => r.url && r.url !== r.id).map((r) => [r.id, r.url]),
    );
  return result;
}
function store(value) {
  const file = resolve(dir, 'manifest.json'),
    temp = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  renameSync(temp, file);
}
export function saveManifest(transform) {
  store(transform(manifest()));
}
export function publishedImage(doc) {
  if (!doc.url || !doc.width || !doc.height) return;
  const variants = Object.values(doc.sizes || {})
    .filter((s) => s?.width && s.url && s.width < doc.width)
    .map((s) => ({ src: s.url, width: s.width, height: s.height }))
    .sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height));
  variants.push({ src: doc.url, width: doc.width, height: doc.height });
  mediaIndex.set(doc.url, { width: doc.width, height: doc.height, variants });
}
export function forgetImage(url) {
  mediaIndex.delete(url);
}
export async function restorePublishedContent(payload, defaults) {
  // Recover the public read model from committed SQLite content, including after a restore.
  let page = 1;
  for (;;) {
    const batch = await payload.find({
      collection: 'media',
      page,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    batch.docs.forEach(publishedImage);
    if (!batch.hasNextPage) break;
    page++;
  }
  const pages = await payload.find({
    collection: 'sections',
    limit: 100,
    depth: 0,
    draft: false,
    where: { _status: { equals: 'published' } },
    overrideAccess: true,
  });
  let site = blankManifest();
  for (const section of pages.docs) {
    const seed = defaults.find((s) => s.key === section.sectionKey);
    if (section.sectionKey === 'earthGuide' || !seed || JSON.stringify(section.rows) !== JSON.stringify(seed.rows))
      site = mergeSection(site, section.sectionKey, section.rows);
  }
  store(site);
}
