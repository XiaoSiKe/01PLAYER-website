// Exercise built public routes against a disposable identity/content store.
// Timing is an observation of this machine, not a production performance SLA.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pagePaths } from '../src/data/page-paths.js';
import { activityPhotos } from '../src/data/activity-photos.js';

const { chromium } = await import('playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), '01player-release-pages-'));
const bind = createServer();
bind.listen(0, '127.0.0.1');
await once(bind, 'listening');
const port = bind.address().port;
await new Promise(resolve => bind.close(resolve));
const origin = 'http://127.0.0.1:' + port;
const guide = JSON.parse(await readFile(join(root, 'cms/src/content/earth-guide-seed.json'), 'utf8'));
await writeFile(join(temp, 'manifest.json'), JSON.stringify({ sections: { earthGuide: guide } }));
const child = spawn(process.execPath, ['server/start.mjs'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test',
    COMMUNITY_DEMO: '1', COMMUNITY_EXTERNAL: '0', COMMUNITY_EVENTS_FILE: '',
    COMMUNITY_DATA_FILE: join(temp, 'community.json'), CLUB_CMS_DATA: temp },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser;
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-5000); });
const stopped = once(child, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(origin + '/api/community/health')).ok; } catch {}
    if (ready) break;
    if (child.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, 'Isolated server did not start. ' + logs);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const routes = ['/', ...Object.values(pagePaths), '/team', '/?page=time-machine',
    '/?page=research', '/?project=knowledge', '/players?event=ai-build-sprint',
    '/plaza?project=campus-agent', '/plaza?view=account'];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      for (const route of routes) {
        const page = await context.newPage(), errors = [], failedAssets = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.url().startsWith(origin + '/') && response.status() >= 400)
            failedAssets.push(response.status() + ' ' + new URL(response.url()).pathname);
        });
        const response = await page.goto(origin + route);
        assert.equal(response.status(), 200, route);
        await page.waitForFunction(() => performance.getEntriesByName('site:first-screen-ready').length > 0);
        await page.locator('.startup-loading').waitFor({ state: 'hidden' });
        await page.locator('h1, .homepage').first().waitFor();
        await page.waitForTimeout(250);
        assert.deepEqual(errors, [], route);
        assert.deepEqual(failedAssets, [], route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' horizontal overflow');
        console.log(JSON.stringify({ route, width, readyMs: await page.evaluate(() =>
          Math.round(performance.getEntriesByName('site:first-screen-ready').at(-1).startTime)) }));
        await page.close();
      }
    } finally { await context.close(); }
  }
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
        downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(origin);
      await page.waitForFunction(() => document.querySelector('.homepage'));
      const result = await page.evaluate(await readFile(join(root, 'scripts/probe-startup.js'), 'utf8'));
      assert.ok(result.firstScreenPrepared, JSON.stringify(result));
      console.log(JSON.stringify({ performance: 'cold homepage, 1.6Mbps/150ms/4xCPU', width, result }));
    } finally { await context.close(); }
  }
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const editedPhoto = { ...activityPhotos[0], title: '延迟发布快照的首屏照片' };
  await page.route('**/site-content/manifest.json', async route => {
    await delay(450);
    await route.fulfill({ json: { sections: { activityPhotos: [editedPhoto] } } });
  });
  await page.goto(origin);
  const tunnelPhoto = page.locator('.tunnel-hero__card');
  await tunnelPhoto.waitFor({ state: 'attached' });
  assert.ok((await tunnelPhoto.getAttribute('aria-label')).includes(editedPhoto.title));
  const startup = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    return {
      scriptStart: resources.find(resource => /\/assets\/main-[^/]+\.js$/.test(resource.name))?.startTime,
      contentEnd: resources.find(resource => resource.name.endsWith('/site-content/manifest.json'))?.responseEnd,
      photos: performance.getEntriesByName('site:first-screen-ready').at(-1)?.detail.images,
    };
  });
  assert.ok(startup.scriptStart < startup.contentEnd, JSON.stringify(startup));
  assert.equal(startup.photos, 1);
  await page.close();
  console.log('通过：生产制品公共路由、资源、桌面与手机、冷启动以及发布快照与应用脚本并行下载。');
} finally {
  await browser?.close();
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await stopped;
  await rm(temp, { recursive: true, force: true });
}
