import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
export const editorialDir = () => resolve(process.env.CLUB_CMS_DATA || '.local/operations');

function representation(data) {
  const hash = createHash('sha256').update(data).digest('base64url');
  return { data, etag: '"' + hash + '"' };
}
const empty = representation(Buffer.from('{}'));
const versionOf = info => [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join('/');
let cached;

async function readSnapshot(file) {
  try {
    const version = versionOf(await stat(file, { bigint: true }));
    if (cached?.file === file && cached.version === version) return await cached.loading;

    // CMS publishes by atomic rename. Pin the descriptor so its bytes and
    // version refer to the same publication if a second publish races this read.
    const entry = { file, version };
    entry.loading = (async () => {
      const handle = await open(file);
      try {
        entry.version = versionOf(await handle.stat({ bigint: true }));
        return representation(await handle.readFile());
      } finally {
        await handle.close();
      }
    })().catch(error => {
      if (cached === entry) cached = undefined;
      throw error;
    });
    cached = entry;
    return await entry.loading;
  } catch (error) {
    if (error.code === 'ENOENT') return empty;
    throw error;
  }
}

export async function serveEditorial(req, res, next) {
  if (req.url?.split('?')[0] !== '/site-content/manifest.json') return next();
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const path = resolve(editorialDir(), 'manifest.json');
  try {
    const { data, etag } = await readSnapshot(path);
    const tags = req.headers['if-none-match'];
    const matched = tags === '*' || tags?.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag);
    res.writeHead(matched ? 304 : 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag,
      ...(matched ? {} : { 'Content-Length': data.length }),
    });
    res.end(req.method === 'HEAD' || matched ? undefined : data);
  } catch {
    res.writeHead(503);
    res.end();
  }
}
