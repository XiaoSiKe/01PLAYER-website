// Uses the built site and an isolated local demo identity database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), '01player-account-browser-'));
const bind = createServer();
bind.listen(0, '127.0.0.1');
await once(bind, 'listening');
const port = bind.address().port;
await new Promise((resolve) => bind.close(resolve));
const base = 'http://127.0.0.1:' + port;
const loginTitle = '登陆账号';
const testBridge = randomBytes(32).toString('hex');
const child = spawn(process.execPath, ['server/start.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    COMMUNITY_DEMO: '1',
    COMMUNITY_EXTERNAL: '0',
    COMMUNITY_STAFF_BRIDGE_SECRET: testBridge,
    COMMUNITY_DATA_FILE: join(temp, 'community.json'),
    CLUB_CMS_DATA: temp,
  },
  stdio: 'ignore',
});
const stopped = once(child, 'exit');
async function checkReviewRoster(browser) {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } });
  try {
    const api = '/api/community/';
    const roster = api + 'registrations';
    const eventId = 'account-browser-roster';
    const staff = { 'X-01-Staff-Secret': testBridge, 'X-01-Staff-Role': 'owner' };
    const login = (email, password) => context.request.post(api + 'login', {
      headers: { 'X-Community-Request': '1' }, data: { email, password },
    });
    assert.equal((await context.request.get(roster + '?page=1')).status(), 401);
    assert.equal((await login('player@example.test', 'Player-2026!')).status(), 200);
    assert.equal((await context.request.get(roster + '?page=1')).status(), 403);
    assert.equal((await login('admin@example.test', 'Admin-2026!')).status(), 200);
    assert.equal((await context.request.post(api + 'staff/events', { headers: staff,
      data: { id: eventId, name: '报名分页验收', description: '独立本机测试', date: '长期开放' },
    })).status(), 200);
    assert.equal((await context.request.post(api + 'staff/events/' + eventId + '/publish',
      { headers: staff, data: {} })).status(), 200);
    for (let i = 1; i <= 21; i++) {
      const response = await fetch(base + api + 'events/' + eventId + '/registrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '测试玩家 ' + i, contact: 'roster-' + i + '@example.test',
          idempotencyKey: 'account-browser-roster-' + i }),
      });
      assert.equal(response.status, 200);
      await response.json();
    }
    const all = await (await context.request.get(roster)).json();
    const first = await (await context.request.get(roster + '?page=1')).json();
    assert.equal(all.length, 21);
    assert.equal(first.total, all.length);
    assert.deepEqual(first.items, all.slice(0, 20));
    assert.ok(!('keyDigest' in first.items[0]) && !('requestDigest' in first.items[0]));
    const page = await context.newPage();
    const pagesRead = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.pathname === roster) pagesRead.push(url.searchParams.get('page'));
    });
    await page.goto('/plaza?view=review');
    const region = page.getByRole('region', { name: '活动报名 · 21' });
    const next = region.getByRole('button', { name: '下一页' });
    const previous = region.getByRole('button', { name: '上一页' });
    await region.getByText('第 1 页 / 共 2 页').waitFor();
    assert.equal(await region.getByRole('heading', { level: 3 }).count(), 20);
    assert.ok(await previous.isDisabled());
    await next.click();
    await region.getByText('测试玩家 21 · 报名分页验收').waitFor();
    assert.equal(await region.getByRole('heading', { level: 3 }).count(), 1);
    assert.ok(await next.isDisabled());
    await previous.click();
    await region.getByText('第 1 页 / 共 2 页').waitFor();
    assert.ok(pagesRead.every(p => p === '1' || p === '2'));
    console.log('通过：官网审核名单鉴权及旧接口兼容，手机往返两页且每次只取当前页');
  } finally { await context.close(); }
}
let browser;
try {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) throw Error('临时测试服务启动失败');
    try {
      const response = await fetch(base + '/api/community/session');
      if (response.ok) break;
    } catch {}
    await delay(100);
  }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  await checkReviewRoster(browser);
  const ctx = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = 'account@example.test',
    password = 'Site-Initial-123',
    replacement = 'Site-Updated-456';
  const button = (name) => page.getByRole('button', { name, exact: true });
  const heading = (name) => page.getByRole('heading', { name, exact: true, level: 1 });
  const via = async (path) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
  };
  await via('/plaza?q=AI');
  await page.locator('.community-card-link').first().click();
  const source = new URL(page.url());
  await page.getByRole('button', { name: /^收藏/ }).click();
  await heading(loginTitle).waitFor();
  assert.equal(await page.getByText('让一切，从此刻发生！', { exact: true }).count(), 0);
  const nav = page.getByRole('banner', { name: '零一玩家导航' });
  const menu = nav.getByRole('button', { name: '打开社区菜单' });
  assert.deepEqual(await nav.getByRole('button').allTextContents(), ['社区导航']);
  const siteLogo = nav.getByRole('link', { name: '返回零一玩家首页顶部' });
  assert.equal(await siteLogo.getAttribute('href'), '/#top');
  assert.equal(await nav.locator('.account-title-logo').count(), 0);
  await page.locator('.account-access .community-panel').getByRole('heading', { name: loginTitle }).waitFor();
  await menu.click();
  await page.getByRole('button', { name: '关闭社区菜单' }).waitFor();
  await page.keyboard.press('Escape');
  await menu.waitFor();
  await page.reload();
  await heading(loginTitle).waitFor();
  await button('还没有零一账号，先注册').click();
  await page.locator('.account-access .community-panel').getByRole('heading', { name: '注册账号' }).waitFor();
  assert.ok(await siteLogo.isVisible());
  assert.equal(await page.getByText('密码至少 10 位。昵称会出现在公开作品的作者栏。', { exact: true }).count(), 0);
  await page.getByLabel('昵称', { exact: false }).fill('界面测试玩家');
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await button('显示密码').click();
  assert.equal(await page.locator('[name=password]').getAttribute('type'), 'text');
  await button('隐藏密码').click();
  assert.equal(await page.locator('[name=password]').getAttribute('autocomplete'), 'new-password');
  await page.evaluate(() => { window.accountTestDocument = 'same-page'; });
  await button('注册并继续').click();
  await heading('玩家空间').waitFor();
  assert.equal(await page.evaluate(() => window.accountTestDocument), 'same-page');
  const accountURL = new URL(page.url());
  assert.equal(accountURL.searchParams.get('view'), 'account');
  assert.equal(accountURL.searchParams.get('from'), source.pathname + source.search + source.hash);
  await page.getByText('已收藏这件作品。', { exact: true }).waitFor();
  assert.ok(await heading('玩家空间').locator('.account-title-logo').isVisible());
  const sidebar = page.getByRole('complementary', { name: '玩家信息' });
  await sidebar.getByRole('heading', { name: '我的收藏', exact: true }).waitFor();
  assert.equal(await sidebar.getByText(email, { exact: true }).count(), 0);
  assert.equal(await sidebar.getByText('零一玩家', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: '我的招募', exact: true }).count(), 0);
  assert.equal(await button('修改密码').count(), 0);
  assert.equal(await button('退出登录').count(), 0);
  assert.equal(await page.getByText(/返回原页面|返回主页面/).count(), 0);
  assert.ok(await page.locator('.sm-icon').evaluate(icon => {
    const center = ({x,y,width,height}) => [x + width / 2, y + height / 2];
    const [cx,cy] = center(icon.getBoundingClientRect());
    return [...icon.children].every(line => {
      const [x,y] = center(line.getBoundingClientRect());
      return Math.abs(x - cx) < 1 && Math.abs(y - cy) < 1;
    });
  }));
  console.log('通过：注册同页进入玩家空间，收藏意图完成，导航加号居中');
  assert.ok(await nav.getByRole('heading', { name: '玩家空间', exact: true }).isVisible());
  await sidebar.getByRole('button', { name: '玩家资料', exact: true }).click();
  await page.getByRole('heading', { name: '玩家资料', exact: true, level: 2 }).waitFor();
  assert.ok(await button('退出登录').isVisible());
  assert.ok(await button('退出登录').locator('svg[aria-hidden="true"]').isVisible());
  assert.equal(await button('参与记录').count(), 0);
  await page.locator('[name=currentPassword]').waitFor();
  assert.equal(await sidebar.count(), 0);
  assert.equal(await button('玩家资料').count(), 0);
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'profile');
  assert.equal(await page.evaluate(() => window.accountTestDocument), 'same-page');
  await page.locator('[name=name]').fill('资料验收玩家');
  await page.locator('[name=university]').fill('资料验收大学');
  const artwork = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 30;
    canvas.height = 45;
    const context = canvas.getContext('2d');
    context.fillStyle = '#333';
    context.fillRect(0, 0, 30, 45);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('选择头像', { exact: true }).setInputFiles({ name: '测试头像.png', mimeType: 'image/png', buffer: Buffer.from(artwork, 'base64') });
  await page.waitForFunction(() => document.querySelector('.player-space-settings .account-avatar img')?.src.startsWith('data:image/jpeg;'));
  await button('保存资料').click();
  await page.getByText('玩家资料已保存。', { exact: true }).waitFor();
  await button('返回空间').click();
  assert.equal(await page.evaluate(() => window.accountTestDocument), 'same-page');
  await page.getByText('资料验收玩家', { exact: true }).waitFor();
  await page.getByText('资料验收大学', { exact: true }).waitFor();
  const avatar = await page.locator('.account-avatar img').getAttribute('src');
  assert.equal((await ctx.request.get(avatar)).headers()['content-type'], 'image/jpeg');
  assert.equal((await fetch(base + avatar)).status, 401);
  await page.reload();
  await page.getByText('资料验收大学', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.account-avatar img')?.naturalWidth === 160);
  console.log('通过：上传头像、修改昵称和大学、返回账号页和刷新后读取，访客无法获取头像');
  const eventId = 'account-browser-roster';
  const signup = await ctx.request.post('/api/community/register-event', {
    headers: { 'X-Community-Request': '1' },
    data: { eventId, name: '界面测试玩家', contact: email },
  });
  assert.equal(signup.status(), 200);
  const registration = await signup.json();
  await page.reload();
  await heading('玩家空间').waitFor();
  await page.getByText('报名成功', { exact: true }).waitFor();
  await page.getByText('报名编号：' + registration.id, { exact: true }).waitFor();
  const archive = await fetch(base + '/api/community/staff/events/' + eventId + '/archive', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-01-Staff-Secret': testBridge }, body: '{}',
  });
  assert.equal(archive.status, 200);
  await page.reload();
  await page.getByText('历史活动', { exact: true }).waitFor();
  await page.getByText('报名成功', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '历史活动' }).count(), 0);
  await page.evaluate(() => { window.accountTestDocument = 'same-page'; });
  await button('玩家资料').click();
  await page.locator('[name=currentPassword]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'profile');
  assert.equal(await page.evaluate(() => window.accountTestDocument), 'same-page');
  assert.equal(await page.getByText(/新密码至少 10 位|所有设备都需要使用新密码/).count(), 0);
  await button('返回空间').click();
  await page.getByRole('heading', { name: '我的报名', exact: true }).waitFor();
  await button('玩家资料').click();
  await page.locator('[name=currentPassword]').waitFor();
  const other = await browser.newContext({ baseURL: base });
  const second = await other.request.post('/api/community/login', {
    headers: { 'X-Community-Request': '1' },
    data: { email, password },
  });
  assert.equal(second.status(), 200);
  await page.locator('[name=currentPassword]').fill(password);
  await page.locator('[name=newPassword]').fill(replacement);
  await page.locator('[name=confirmPassword]').fill(replacement + 'bad');
  await button('更新密码').click();
  await page.getByRole('alert').getByText('两次输入的新密码不一致。').waitFor();
  await page.locator('[name=confirmPassword]').fill(replacement);
  await button('更新密码').click();
  await heading(loginTitle).waitFor();
  assert.equal((await (await other.request.get('/api/community/session')).json()).user, null);
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(password);
  await button('欢迎加入地球Online：零一玩家').click();
  await page.getByRole('alert').waitFor();
  await page.locator('[name=password]').fill(replacement);
  await button('欢迎加入地球Online：零一玩家').click();
  await heading('玩家空间').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('view'), 'account');
  console.log('通过：两次新密码校验、旧密码和其他设备会话失效、重新登录进入玩家空间');
  const otherTab = await ctx.newPage();
  await otherTab.goto('/plaza?view=account');
  await otherTab.getByRole('heading', { name: '玩家空间', exact: true }).waitFor();
  await via('/players?filter=open');
  await page.locator('.site-account-link').click();
  await heading('玩家空间').waitFor();
  await button('玩家资料').click();
  await button('退出登录').click();
  await heading('玩家计划').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('filter'), 'open');
  assert.equal((await (await ctx.request.get('/api/community/session')).json()).user, null);
  await otherTab.getByRole('heading', { name: loginTitle }).waitFor();
  assert.equal(await otherTab.getByText(email, { exact: true }).count(), 0);
  await otherTab.close();
  await via('/players?view=login&returnTo=%2F%2Fother.example');
  await heading(loginTitle).waitFor();
  assert.equal(await page.locator('a.community-back').count(), 0);
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(replacement);
  await button('欢迎加入地球Online：零一玩家').click();
  await heading('玩家空间').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('from'), '/players');
  await button('玩家资料').click();
  await button('退出登录').click();
  await heading('玩家计划').waitFor();
  await via('/plaza?view=publish&from=' + encodeURIComponent('/plaza?q=AI'));
  await heading(loginTitle).waitFor();
  await page.locator('[name=email]').fill(email);
  await page.locator('[name=password]').fill(replacement);
  await button('欢迎加入地球Online：零一玩家').click();
  await heading('玩家空间').waitFor();
  assert.ok(await page.getByRole('link', { name: '发布项目', exact: true }).isVisible());
  await page.getByRole('link', { name: '继续发布项目' }).click();
  await heading('发布你的项目').waitFor();
  assert.ok(await heading('发布你的项目').locator('.account-title-logo').isVisible());
  await page.getByRole('link', { name: '返回页面' }).click();
  assert.equal(new URL(page.url()).searchParams.get('q'), 'AI');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.site-account-link').waitFor();
    assert.ok(
      await page
        .locator('.sm-header-actions')
        .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
    );
  }
  const post = (request, path, data = {}) =>
    request.post('/api/community/' + path, { headers: { 'X-Community-Request': '1' }, data });
  const accountId = (await (await ctx.request.get('/api/community/session')).json()).user.id;
  const managed = async (action) => {
    const result = await fetch(base + '/api/community/staff/users/' + accountId + '/' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-01-Staff-Secret': testBridge,
        'X-01-Staff-Role': 'owner',
        'X-01-Staff-Id': 'browser-test',
      },
      body: '{}',
    });
    assert.equal(result.status, 200, action);
  };
  await page.clock.install();
  await via('/plaza?view=account');
  await heading('玩家空间').waitFor();
  await page.bringToFront();
  assert.ok(await page.evaluate(() => document.hasFocus() && !document.hidden));
  await managed('disable');
  await page.clock.fastForward(30100);
  await heading(loginTitle).waitFor();
  assert.equal(await page.getByText(email, { exact: true }).count(), 0);
  await managed('restore');
  const loginAs = async (address, secret) =>
    assert.equal((await post(ctx.request, 'login', { email: address, password: secret })).status(), 200);
  await loginAs(email, replacement);
  await via('/plaza?view=password');
  await page.getByRole('heading', { name: '玩家资料', exact: true, level: 2 }).waitFor();
  await page.locator('[name=currentPassword]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('view'), 'account');
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'profile');
  await page.locator('[name=currentPassword]').fill(replacement);
  await page.locator('[name=newPassword]').fill(replacement + '1');
  await page.locator('[name=confirmPassword]').fill(replacement + '1');
  await managed('revoke-sessions');
  await button('更新密码').click();
  await heading(loginTitle).waitFor();
  console.log('通过：前台停用账号 30 秒内隐藏私有身份，已撤销会话遇到 401 立即回到登录');
  await loginAs(email, replacement);
  await via('/plaza?view=publish');
  await heading('发布你的项目').waitFor();
  const title = page.locator('input[name=name]');
  await title.fill('A 的私有草稿');
  await page.locator('[name=summary]').fill('草稿摘要');
  await page.locator('textarea[name=description]').fill('草稿正文');
  await page.locator('[name=demoUrl]').fill('https://example.test/demo');
  await loginAs('player@example.test', 'Player-2026!');
  const denied = page.waitForResponse(
    (r) => r.url().endsWith('/api/community/projects') && r.request().method() === 'POST',
  );
  await button('提交审核').click();
  assert.equal((await denied).status(), 401);
  await page.waitForFunction(() => document.querySelector('input[name=name]')?.value === '');
  await title.fill('B 的另一份草稿');
  await loginAs(email, replacement);
  await page.clock.fastForward(700);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('input[name=name]')?.value === 'A 的私有草稿');
  console.log('通过：切换身份期间拒绝替另一玩家投稿，两人的草稿隔离并可恢复');
  const ownProjectName = '详情页修改验收作品';
  const created = await post(ctx.request, 'projects', {
    name: ownProjectName,
    summary: '原项目简介',
    description: '通过作品详情打开编辑表单。',
    demoUrl: 'https://example.test/owner-demo',
  });
  assert.equal(created.status(), 200);
  const ownProject = await created.json();
  await via('/plaza?view=account');
  const ownCard = page.getByRole('link', { name: new RegExp(ownProjectName) });
  const edit = page.getByRole('link', { name: '修改项目', exact: true });
  await ownCard.waitFor();
  assert.equal(await edit.count(), 0);
  await ownCard.click();
  const actions = page.getByRole('navigation', { name: '项目详情目录' }).locator('.detail-section-actions');
  await actions.getByRole('link', { name: '修改项目', exact: true }).waitFor();
  assert.ok(await actions.getByRole('link', { name: '打开项目演示', exact: true }).isVisible());
  assert.ok(await actions.getByRole('button', { name: '分享作品', exact: true }).isVisible());
  assert.equal(await page.locator('a.discovery-detail-back').count(), 0);
  await page.goBack();
  await ownCard.click();
  await edit.click();
  await heading('修改项目').waitFor();
  assert.equal(await title.inputValue(), ownProjectName);
  await page.locator('[name=summary]').fill('从详情页修改后的简介');
  await button('提交审核').click();
  await ownCard.waitFor();
  assert.match(await ownCard.innerText(), /从详情页修改后的简介/);
  assert.equal((await post(other.request, 'login', { email: 'admin@example.test', password: 'Admin-2026!' })).status(), 200);
  assert.equal((await post(other.request, 'review/' + ownProject.id, { status: 'approved' })).status(), 200);
  const viewer = await other.newPage();
  await viewer.goto('/plaza?project=' + ownProject.id);
  await viewer.getByRole('heading', { name: ownProjectName, exact: true }).waitFor();
  assert.equal(await viewer.getByRole('link', { name: '修改项目', exact: true }).count(), 0);
  await viewer.close();
  console.log('通过：项目整卡进入详情，本人可修改并返回空间，其他账号看不到编辑入口');
  await via('/players?event=ai-build-sprint&category=competition&q=AI');
  await page.getByRole('link', { name: '发布组队招募', exact: true }).click();
  await page.locator('[name=projectId]').selectOption(ownProject.id);
  await page.locator('[name=title]').fill('筛选回跳验收招募');
  await page.locator('textarea[name=description]').fill('验证招募成功后保留原活动筛选。');
  await page.locator('[name=roles]').fill('前端开发');
  await page.locator('[name=work]').fill('参与官网验证');
  await page.locator('[name=requirements]').fill('能参与本地验收');
  await page.locator('[name=contact]').fill('fixture@example.test');
  await button('发布招募').click();
  await page.getByText('招募已发布。', { exact: true }).waitFor();
  const recruitmentReturn = new URL(page.url()).searchParams;
  assert.equal(recruitmentReturn.get('category'), 'competition');
  assert.equal(recruitmentReturn.get('q'), 'AI');
  console.log('通过：发布活动招募后返回原场次和筛选');
  assert.deepEqual(errors, []);
  console.log('通过：其他标签退出后清除身份、手机导航完整显示');
  console.log('通过：退出保留来源、拒绝站外回跳、登录后继续发布并返回原筛选');
} finally {
  if (browser) await browser.close();
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    await stopped;
  }
  await rm(temp, { recursive: true, force: true });
}
