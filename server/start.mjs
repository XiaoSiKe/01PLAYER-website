import { serveEditorial } from './editorial-snapshot.mjs';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createCommunityApi } from './community-api.mjs';
import { pageFromPath } from '../src/data/page-paths.js';
const demo = process.env.COMMUNITY_DEMO === '1';
if (process.env.NODE_ENV === 'production' && demo) throw Error('正式环境禁止使用示例账号。');
const api = process.env.COMMUNITY_EXTERNAL === '1' ? (_req, _res, next) => next() : createCommunityApi({ demo, secure: process.env.NODE_ENV === 'production' });
const root = resolve('dist');
if (!existsSync(resolve(root, 'index.html'))) throw Error('请先运行 npm run build。');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.ico':'image/x-icon' };
const server = createServer({
  headersTimeout: 15000,
  requestTimeout: 120000,
  connectionsCheckingInterval: 5000,
  keepAliveTimeout: 5000,
  maxHeaderSize: 16384,
}, (req,res)=>serveEditorial(req,res,()=>api(req,res,()=>{
  let pathname; try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  const pagePath = pathname === '/' || pageFromPath(pathname) ? '/index.html' : pathname;
  const file = resolve(root, `.${pagePath}`);
  if (!file.startsWith(root+sep) || !existsSync(file) || !statSync(file).isFile() || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); return res.end('Not found'); }
  res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream'); res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method==='HEAD') return res.end();
  createReadStream(file).pipe(res);
})));
server.maxConnections = 1024;
server.maxRequestsPerSocket = 1000;
function shutdown() {
  const deadline = setTimeout(() => server.closeAllConnections(), 30000).unref();
  server.close(() => {
    clearTimeout(deadline);
    api.close?.();
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1',()=>console.log(`零一官网 http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 4173}`));
