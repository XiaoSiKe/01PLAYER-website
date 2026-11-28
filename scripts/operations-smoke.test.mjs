import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkOperationsSite } from '../deploy/operations/smoke.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { get } from 'node:http';

const run = promisify(execFile);
const commit = 'a'.repeat(40);
const homepage = '<!doctype html><title>01PLAYER</title>';
const js = '/_next/static/chunks/app.js';
const css = '/_next/static/css/admin.css';
const login = '<title>登录 · 零一玩家</title><form><input type="password"></form>' +
  '<script src="' + js + '"></script><link rel="stylesheet" href="' + css + '">';

test('地图静态资源按浏览器能力返回预压缩文件，普通读取与 HEAD 保留正确正文和长度', async t => {
  const directory = await mkdtemp(join(tmpdir(), '01player-asset-'));
  const dist = join(directory, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  const raw = Buffer.from('lossless atlas fixture '.repeat(200));
  const compressed = gzipSync(raw);
  await Promise.all([
    writeFile(join(dist, 'index.html'), homepage),
    writeFile(join(dist, 'assets/map.bin'), raw),
    writeFile(join(dist, 'assets/map.bin.gz'), compressed),
    writeFile(join(dist, 'assets/plain.bin'), raw),
  ]);
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const server = spawn(process.execPath, [fileURLToPath(new URL('../server/start.mjs', import.meta.url))], {
    cwd: directory, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), COMMUNITY_EXTERNAL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  await once(server.stdout, 'data');
  const request = (path, encoding, method = 'GET') => new Promise((resolve, reject) => {
    const req = get({ hostname: '127.0.0.1', port, path, method, headers: { 'Accept-Encoding': encoding } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
  for (const encoding of ['gzip', 'br, gzip;q=0.5']) {
    const response = await request('/assets/map.bin', encoding);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], 'gzip');
    assert.equal(response.headers.vary, 'Accept-Encoding');
    assert.equal(Number(response.headers['content-length']), compressed.length);
    assert.deepEqual(gunzipSync(response.body), raw);
  }
  for (const encoding of ['identity', 'gzip;q=0', 'br']) {
    const response = await request('/assets/map.bin', encoding);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.deepEqual(response.body, raw);
  }
  const head = await request('/assets/map.bin', 'gzip', 'HEAD');
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), compressed.length);
  assert.deepEqual((await request('/assets/plain.bin', 'gzip')).body, raw);
});

test('部署冒烟及只读运维命令识别静态首页回落', async t => {
  function json(value, status = 200) { return [status, 'application/json', JSON.stringify(value)]; }
  const routes = new Map([
    ['/', [200, 'text/html', homepage]], ['/version.json', json({commit})],
    ['/api/community/health', json({service: '01player-community', status: 'ok', demo: false})],
    ['/api/community/events', json([])], ['/site-content/manifest.json', json({})],
    ['/admin', [307, 'text/plain', '', '/admin/login']], ['/admin/login', [200, 'text/html', login]],
    [js, [200, 'text/javascript', 'console.log("ready");']], [css, [200, 'text/css', 'body{}']],
    ['/cms-api/health-board', json({error: '请登录后台'}, 403)], ['/game.html', [200, 'text/html', '25th']]
  ]);
  const requested = [];
  const server = createServer((req, res) => {
    requested.push(req.url);
    const [status, type, body, location] = routes.get(req.url) || [404, 'text/plain', 'missing'];
    res.writeHead(status, {'content-type': type, ...(location && {location})});
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const check = () => checkOperationsSite(origin, {expectedCommit: commit, requireProduction: true});
  await check();
  assert.deepEqual(requested.toSorted(), [...routes.keys()].filter(path => path !== '/game.html').sort());
  await t.test('本地快照可用于预览，正式验收需要实际提交', async () => {
    const original = routes.get('/version.json');
    try {
      routes.set('/version.json', json({ commit: null, source: 'working-tree-snapshot' }));
      await checkOperationsSite(origin);
      await assert.rejects(check, /工作区快照/);
    } finally { routes.set('/version.json', original); }
  });

  await t.test('Next 已开始发送 HTML 时也可跳转登录', async () => {
    const original = routes.get('/admin');
    try {
      routes.set('/admin', [200, 'text/html', '<script>self.__next_f.push("NEXT_REDIRECT;replace;/admin/login;307;")</script>']);
      await check();
    } finally { routes.set('/admin', original); }
  });
  await t.test('客户端渲染的运营登录页可用服务器标记识别', async () => {
    const original = routes.get('/admin/login');
    try {
      routes.set('/admin/login', [200, 'text/html', login.replace(
        '<form><input type="password"></form>', '<div data-staff-login=""></div>',
      )]);
      await check();
    } finally { routes.set('/admin/login', original); }
  });

  for (const [name, path, response, error] of [
    ['社区 API 回首页', '/api/community/health', [200, 'text/html', homepage], /\/api\/community\/health.*JSON/],
    ['管理员入口回首页', '/admin', [200, 'text/html', homepage], /\/admin.*登录页/],
    ['循环登录跳转', '/admin/login', [307, 'text/plain', '', '/admin/login'], /\/admin\/login.*跳转循环/],
    ['跳往外站', '/admin', [302, 'text/plain', '', 'https://example.invalid/admin/login'], /\/admin.*同源/],
    ['脚本变成首页', js, [200, 'text/html', homepage], /app\.js.*text\/html/],
    ['样式伪装成 CSS 的 HTML', css, [200, 'text/css', homepage], /admin\.css.*HTML/],
    ['匿名后台接受请求', '/cms-api/health-board', json({}, 200), /health-board.*HTTP 200/],
    ['代理权限错误页冒充 CMS', '/cms-api/health-board', [403, 'text/html', homepage], /health-board.*JSON/],
  ]) {
    await t.test(name, async () => {
      const original = routes.get(path);
      try {
        routes.set(path, response);
        await assert.rejects(check, error);
      } finally { routes.set(path, original); }
    });
  }

  await t.test('ops:check 无需私有配置，官网故障时仍检查受保护站点', async () => {
    // Keep the CLI offline: use the loopback HTTP responses and a verified certificate with a fixed clock.
    const mock = `
    import tls from 'node:tls';
    import { EventEmitter } from 'node:events';
    import { syncBuiltinESMExports } from 'node:module';
    Date.now=()=>Date.UTC(2030,0,1);
    tls.connect=opts=>{
      if (opts.host!=='club.01aiedu.com' || opts.servername!==opts.host || opts.port!==443 ||
          opts.rejectUnauthorized!==true || !opts.signal) throw Error('TLS hostname, validation and deadline required');
      const socket=new EventEmitter();
      socket.authorized=true;
      socket.destroy=()=>{};
      socket.getPeerCertificate=()=>({valid_to:new Date(Date.now()+Number(process.env.FIXTURE_TLS_HOURS)*3600000).toUTCString()});
      queueMicrotask(()=>socket.emit('secureConnect'));
      return socket;
    };
    syncBuiltinESMExports();
    const nativeFetch=fetch;globalThis.fetch=(url,init)=>{
      const target=new URL(url);
      if (!['club.01aiedu.com','arch.25thgame.vip'].includes(target.hostname)) throw Error('unexpected host');
      return nativeFetch(new URL(target.pathname+target.search,${JSON.stringify(origin)}),init)
    }`;
    const args = ['--import', 'data:text/javascript;base64,' + Buffer.from(mock).toString('base64'),
      fileURLToPath(new URL('./ops.mjs', import.meta.url)), 'check'];
    const opts = {env: { ...process.env, OPS_CONFIG_FILE: '/nonexistent-ops-fixture/private.env', FIXTURE_TLS_HOURS: '168' }};
    const good = await run(process.execPath, args, opts);
    assert.match(good.stdout, /官网 TLS：有效期至 2030-01-08T00:00:00.000Z/);
    assert.match(good.stdout, /25th：HTTP 200/);

    opts.env.FIXTURE_TLS_HOURS = '167';
    await assert.rejects(run(process.execPath, args, opts), err => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /官网 TLS：有效期至 2030-01-07T23:00:00.000Z.*低于 7 天/);
      assert.match(err.stdout, /运营登录页和后台权限检查通过/);
      return true;
    });
    routes.set('/', [200, 'text/html', '旧版官网首页']);
    routes.set('/api/community/health', [200, 'text/html', homepage]);
    routes.set('/admin', [200, 'text/html', homepage]);
    await assert.rejects(run(process.execPath, args, opts), err => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /官网 TLS.*低于 7 天/);
      assert.match(err.stderr, /首页品牌标识缺失/);
      assert.match(err.stderr, /\/api\/community\/health.*JSON/);
      assert.match(err.stderr, /\/admin.*登录页/);
      assert.match(err.stdout, /25th：HTTP 200/);
      return true;
    });
  });
});
