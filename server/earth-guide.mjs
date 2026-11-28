import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { editorialDir, readSnapshot } from './editorial-snapshot.mjs';
import { guideContent } from './guide-content.mjs';

export function createEarthGuideHandler({ manifestFile } = {}) {
  let cachedSnapshot, representation;
  return async function serveEarthGuide(req, res, next) {
    if (req.url?.split('?')[0] !== '/site-content/earth-guide.json') return next();
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
    }
    try {
      const snapshot = await readSnapshot(manifestFile || resolve(editorialDir(), 'manifest.json'));
      // readSnapshot changes identity on each atomic publication, even when
      // equal-size content is replaced. Keep only the latest valid representation.
      if (snapshot !== cachedSnapshot) {
        const rows = JSON.parse(snapshot.data).sections?.earthGuide ?? [];
        const content = guideContent(rows);
        const revision = createHash('sha256').update(JSON.stringify(content)).digest('hex');
        representation = { etag: `"${revision}"`, data: Buffer.from(JSON.stringify({ revision, ...content })) };
        cachedSnapshot = snapshot;
      }
      const { etag, data } = representation;
      const tags = req.headers['if-none-match'];
      const matched = tags === '*' || tags?.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag);
      res.writeHead(matched ? 304 : 200, {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff', ETag: etag,
      });
      res.end(req.method === 'HEAD' || matched ? undefined : data);
    } catch {
      res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end();
    }
  };
}
export const serveEarthGuide = createEarthGuideHandler();
