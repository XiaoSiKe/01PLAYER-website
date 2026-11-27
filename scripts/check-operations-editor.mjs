import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

const origin = new URL(process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173');
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
  throw Error('此测试使用本机运营预览账号，请指定本机预览地址。');
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({
    baseURL: origin.origin,
    viewport: { width: 390, height: 844 },
    timezoneId: 'Africa/Lagos',
  });
  const password =
    process.env.CMS_OWNER_PASSWORD ||
    (await readFile(new URL('../.local/operations/preview-password', import.meta.url), 'utf8')).trim();
  const response = await context.request.post('/cms-api/staff/login', {
    data: { email: process.env.CMS_OWNER_EMAIL || 'operator@01player.test', password },
  });
  assert.ok(response.ok(), '请启动本机运营预览，并使用该预览的账号。');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  // The page and login are real. Intercept all business requests so test submissions never enter the workspace.
  let event = {
    id: 'editor-fixture',
    name: '排练场次',
    status: 'open',
    publicationStatus: 'draft',
    rules: [],
    formFields: [],
    hasAlbum: true,
    draftRevision: 'r1',
  };
  let firstSave,
    simulateLostResponse = true,
    conflict = false;
  let extraEvents = [];
  await page.route('**/cms-api/desk', async (route) => {
    const request = route.request().postDataJSON();
    if (request.method === 'GET') {
      if (request.path === 'staff/photos') {
        const key = request.query.event;
        if (key === event.id) await new Promise((resolve) => setTimeout(resolve, 500));
        return route
          .fulfill({
            json: [{ id: key, title: '照片 ' + key, imageUrl: '/images/club-logo-white.svg' }],
          })
          .catch(() => {});
      }
      return route.fulfill({
        json:
          request.path === 'staff/events'
            ? [event, { ...event, id: 'album-b', name: '另一个相册' }, ...extraEvents]
            : event,
      });
    }
    if (request.path === 'staff/events') {
      if (simulateLostResponse) {
        simulateLostResponse = false;
        firstSave = request.data;
        return route.abort('connectionreset');
      }
      assert.deepEqual(request.data, firstSave, '重试新建须使用相同 ID 和内容');
      event = { ...event, ...request.data };
    } else if (request.path.endsWith('/publish')) {
      assert.equal(request.data.draftRevision, event.draftRevision);
      return route.fulfill({ status: 400, json: { error: '发布前请填写活动介绍。' } });
    } else if (conflict) {
      conflict = false;
      event = { ...event, name: '另一位运营的新标题', draftRevision: 'r2' };
      return route.fulfill({ status: 409, json: { error: '活动版本已更新。' } });
    } else {
      assert.fail('遇到未预期的写入操作 ' + request.path);
    }
    return route.fulfill({ json: event });
  });
  await page.goto('/admin/operations?tab=events&new=1');
  const name = page.getByLabel('活动名称');
  await name.fill('校内共创日');
  await page.getByLabel('开始时间', { exact: true }).fill('2026-12-05T14:30');
  await page.getByLabel('参与规则（每行一条）').fill('提前到场\n');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '活动相册', exact: true }).click();
  assert.equal(await name.inputValue(), '校内共创日');
  const publish = page.getByRole('button', { name: '发布活动' });
  await publish.click();
  await page.getByRole('alert').filter({hasText:'连接中断'}).waitFor();
  await publish.click();
  await page.getByRole('alert').filter({ hasText: '草稿已保存，发布未完成' }).waitFor();
  assert.deepEqual(firstSave.rules, ['提前到场']);
  assert.equal(firstSave.startsAt, '2026-12-05T06:30:00.000Z');
  assert.equal(new URL(page.url()).searchParams.get('edit'), event.id);
  await page.reload();
  await page.getByRole('heading', { name: '编辑活动' }).waitFor();
  assert.equal(await name.inputValue(), '校内共创日');
  conflict = true;
  await name.fill('本机编辑');
  await page.getByRole('button', { name: '保存草稿' }).click();
  const latest = page.getByRole('button', { name: '载入最新版本' });
  await latest.waitFor();
  assert.equal(await name.inputValue(), '本机编辑');
  page.once('dialog', (dialog) => dialog.accept());
  await latest.click();
  await page.getByText('已载入最新版本。').waitFor();
  assert.equal(await name.inputValue(), '另一位运营的新标题');
  await page.getByRole('button', { name: '活动相册', exact: true }).click();
  await page.getByLabel('活动相册', { exact: true }).selectOption('album-b');
  await page.getByText('照片 album-b').waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.getByText('照片 ' + event.id).count(), 0);
  extraEvents = Array.from({ length: 60 }, (_, index) => ({
    id: 'perf-' + index, name: '测试活动 ' + index, publicationStatus: 'published',
  }));
  await page.goto('/admin/operations?tab=events');
  await page.getByText('共 62 场活动').waitFor();
  assert.equal(await page.locator('.op-event-row').count(), 20);
  assert.equal(await page.locator('.op-event-row .specular-button__fx, .op-event-row canvas').count(), 0);
  const rowAction = page.locator('.op-event-row .op-action').first();
  const shine = () => rowAction.evaluate((button) => getComputedStyle(button, '::before').content);
  await page.mouse.move(0, 0);
  assert.equal(await shine(), 'none');
  await rowAction.hover();
  assert.equal(await shine(), '""');
  const paging = page.getByRole('navigation', { name: '活动管理分页' });
  await paging.getByRole('button', { name: '下一页' }).click();
  await paging.getByText('第 2 页 / 共 4 页').waitFor();
  await page.locator('.op-filters select').selectOption('published');
  await paging.getByText('第 1 页 / 共 3 页').waitFor();
  await page.getByText('共 60 场活动').waitFor();
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.locator('.template-default--nav-hydrated').waitFor({ state: 'attached' });
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.op-shortcuts').getByRole('link', { name: '玩家管理' }).click();
  await page.getByRole('heading', { name: '玩家管理', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
  assert.deepEqual(errors, []);
  console.log('通过：编辑离开保护、断网重试、部分发布失败、恢复草稿、时区、多人修改冲突和相册切换。');
} finally {
  await browser.close();
}
