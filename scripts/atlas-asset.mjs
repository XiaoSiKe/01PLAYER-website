import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { encodeAtlas } from '../src/components/atlasCodec.js';

// Both the development server and release build serve the same lossless asset.
export function atlasAsset() {
  const file = new URL('../src/data/maps/branch-atlas.json', import.meta.url);
  let development = false;
  return {
    name: 'branch-atlas-asset',
    configResolved(config) { development = config.command === 'serve'; },
    resolveId(id) { if (id === 'virtual:branch-atlas') return '\0branch-atlas'; },
    load(id) {
      if (id !== '\0branch-atlas') return;
      if (development) return 'export default "/@branch-atlas.bin"';
      const source = encodeAtlas(JSON.parse(readFileSync(file, 'utf8')));
      const reference = this.emitFile({ type: 'asset', name: 'branch-atlas.bin', source });
      return `export default import.meta.ROLLUP_FILE_URL_${reference}`;
    },
    generateBundle(_, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.bin')) continue;
        this.emitFile({ type: 'asset', fileName: asset.fileName + '.gz', source: gzipSync(asset.source, { level: 9 }) });
      }
    },
    configureServer(server) {
      server.middlewares.use('/@branch-atlas.bin', (req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) return next();
        try {
          const data = encodeAtlas(JSON.parse(readFileSync(file, 'utf8')));
          const etag = '"' + createHash('sha256').update(data).digest('hex') + '"';
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('ETag', etag);
          if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
          res.end(req.method === 'HEAD' ? undefined : data);
        } catch (error) { next(error); }
      });
    },
  };
}
