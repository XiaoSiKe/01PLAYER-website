import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parseGuideArticle } from './earth-guide-document.mjs';

const repository = 'XiaoSiKe/01player-earth-survival-guide';
const endpoint = '/site-content/earth-guide.json';
const refreshInterval = 120_000;
const articleLimit = 100;
const articleBytes = 128 * 1024;
const contentBytes = 6 * 1024 * 1024;
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedIds = ['overview', 'reading', 'skill', 'guide-content'];

function readGroups(manifest) {
  const groups = manifest?.groups;
  if (!Array.isArray(groups) || !groups.length || groups.length > articleLimit) throw new Error('Invalid guide directory');
  const ids = new Set();
  return groups.map(group => {
    const { id, title } = group ?? {};
    if (typeof id !== 'string' || id.length > 64 || !identifier.test(id) || !id.startsWith('reading-')
      || ids.has(id) || typeof title !== 'string' || !title.trim() || title.length > 120) throw new Error('Invalid guide group');
    ids.add(id);
    return { id, title: title.trim(), chapters: [] };
  });
}

async function readLimited(response, limit) {
  if (!response.ok || !response.body) throw new Error('Guide source unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let value = '';
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) return value + decoder.decode();
    size += chunk.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Guide file is too large');
    }
    value += decoder.decode(chunk, { stream: true });
  }
}

async function readSnapshot(read, list, revision) {
  const groups = readGroups(JSON.parse(await read('chapters.json')));
  const groupById = new Map(groups.map(group => [group.id, group]));
  const ids = new Set([...reservedIds, ...groupById.keys()]);
  const candidates = [];
  for (const file of await list()) {
    const match = file.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.md$/);
    if (!match || !groupById.has(match[1])) continue;
    const [, groupId, id] = match;
    if (id.length > 64 || !identifier.test(id) || ids.has(id)) throw new Error('Invalid or duplicate article ID');
    ids.add(id);
    candidates.push({ file, id, group: groupById.get(groupId) });
  }
  if (!candidates.length || candidates.length > articleLimit) throw new Error('Invalid number of guide articles');

  const articles = Object.create(null);
  let size = 0;
  for (let start = 0; start < candidates.length; start += 8) {
    await Promise.all(candidates.slice(start, start + 8).map(async ({ file, id, group }) => {
      const markdown = await read(file);
      const bytes = Buffer.byteLength(markdown);
      const { title, order } = parseGuideArticle(markdown);
      size += bytes;
      if (!title || title.length > 120 || bytes > articleBytes || size > contentBytes) throw new Error('Invalid guide article');
      group.chapters.push({ id, title, order });
      articles[id] = markdown;
    }));
  }
  const directory = groups.filter(group => group.chapters.length).map(group => ({
    ...group,
    chapters: group.chapters.sort((left, right) => (left.order - right.order) || left.id.localeCompare(right.id))
      .map(({ id, title }) => ({ id, title })),
  }));
  const orderedArticles = directory.flatMap(group => group.chapters).map(({ id }) => [id, articles[id]]);
  const content = { groups: directory, articles: Object.fromEntries(orderedArticles) };
  const version = revision ?? createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const data = Buffer.from(JSON.stringify({ revision: version, ...content }));
  return { data, revision: version };
}

export function createEarthGuideHandler({ sourceDirectory, fetchResource = fetch, now = Date.now } = {}) {
  let cached;
  let pending;
  let nextRefresh = 0;

  async function refresh() {
    const signal = AbortSignal.timeout(12_000);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': '01PLAYER-website' };
    const api = `https://api.github.com/repos/${repository}`;
    const refResponse = await fetchResource(api + '/git/ref/heads/main', { signal, headers });
    const { object } = JSON.parse(await readLimited(refResponse, 16 * 1024));
    if (typeof object?.sha !== 'string' || !/^[a-f0-9]{40}$/.test(object.sha)) throw new Error('Invalid guide revision');
    if (cached?.revision === object.sha) return cached;

    const base = api + '/contents/articles/';
    const read = async file => {
      const response = await fetchResource(base + file + '?ref=' + object.sha, {
        signal, redirect: 'error', headers: { ...headers, Accept: 'application/vnd.github.raw+json' },
      });
      return readLimited(response, articleBytes);
    };
    const list = async () => {
      const response = await fetchResource(`${api}/git/trees/${object.sha}?recursive=1`, { signal, headers });
      const { tree, truncated } = JSON.parse(await readLimited(response, 3 * 1024 * 1024));
      if (!Array.isArray(tree) || truncated) throw new Error('Incomplete guide tree');
      return tree.filter(item => item.type === 'blob' && item.mode !== '120000' && item.path?.startsWith('articles/'))
        .map(item => item.path.slice('articles/'.length));
    };
    return readSnapshot(read, list, object.sha);
  }

  async function snapshot() {
    if (sourceDirectory) {
      return readSnapshot(file => readFile(join(sourceDirectory, file), 'utf8'), async () => {
        const entries = await readdir(sourceDirectory, { recursive: true, withFileTypes: true });
        return entries.filter(entry => entry.isFile())
          .map(entry => relative(sourceDirectory, join(entry.parentPath, entry.name)).split(sep).join('/'));
      });
    }
    if (pending) return pending;
    if (now() < nextRefresh) return cached;
    nextRefresh = now() + refreshInterval;
    pending = refresh().then(result => { cached = result; return result; }).catch(() => cached).finally(() => { pending = undefined; });
    return pending;
  }

  return async function serveEarthGuide(req, res, next) {
    if (req.url?.split('?')[0] !== endpoint) return next();
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    let content;
    try {
      content = await snapshot();
    } catch {
      // The preview may read a directory being edited.
    }
    if (!content) {
      res.writeHead(503, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    const etag = `"${content.revision}"`;
    const matched = req.headers['if-none-match'] === etag;
    res.writeHead(matched ? 304 : 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag,
    });
    res.end(req.method === 'HEAD' || matched ? undefined : content.data);
  };
}

export const serveEarthGuide = createEarthGuideHandler({ sourceDirectory: process.env.EARTH_GUIDE_SOURCE_DIR });
