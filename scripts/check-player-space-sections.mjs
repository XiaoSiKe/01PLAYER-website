import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const user = { id: 'space-preview', name: '资料预览玩家', role: 'player', university: '预览大学', publicContact: '公开联系方式', avatar: '/images/branches/fzu-crest.png' };
const event = { id: 'space-event', name: '已报名的活动', status: 'open', type: '赛事', category: 'competition', date: '2035.12.01' };
const mine = { projects: [{ id: 'mine-project', name: '我的项目名称', summary: '手机不应显示这段项目简介', status: 'pending', reviewNote: '审核修改建议' }],
  registrations: [{ id: 'private-receipt-number', eventId: event.id, status: 'approved' }], recruitments: [] };
const projects = [{ id: 'saved-project', name: '收藏项目', author: '收藏作者', saved: true, liked: false },
  { id: 'liked-project', name: '喜欢项目', author: '喜欢作者', saved: false, liked: true }];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/community/**', route => {
      const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
      return route.fulfill({ json: path === 'session' ? { user, demo: true } : path === 'mine' ? mine : path === 'projects' ? projects : path === 'events' ? [event] : [] });
    });
    await page.goto(origin + '/plaza?view=account');
    await page.getByRole('heading', { name: '我的项目', exact: true }).waitFor();
    const sidebar = page.getByRole('complementary', { name: '玩家信息' });
    assert.deepEqual(await sidebar.locator('.player-space-shortcuts button').allTextContents(), ['我的收藏','我的喜欢','玩家资料','账号设置']);
    if (width <= 760) {
      assert.equal(await page.locator('.player-record-project-summary').isVisible(), false);
      assert.equal(await page.locator('.player-record-project-status').isVisible(), false);
      assert.equal(await page.locator('.player-record-registration-id').isVisible(), false);
      const profile = sidebar.locator('.account-identity'), shortcuts = sidebar.locator('.player-space-shortcuts');
      const left = await profile.boundingBox(), right = await shortcuts.boundingBox();
      assert.ok(left.x + left.width <= right.x);
      assert.equal(await profile.evaluate(el => getComputedStyle(el).textAlign), 'left');
    } else assert.equal(await page.locator('.player-record-registration-id').isVisible(), true);
    const back = () => page.locator('.player-space-content').getByRole('button', { name: '返回', exact: true }).click();
    async function checkSettingsReturn(panelSelector) {
      const control = page.locator('.player-space-content').getByRole('button', { name: '返回', exact: true });
      assert.equal(await control.count(), 1);
      const panel = page.locator(panelSelector);
      assert.equal(await panel.getByRole('button', { name: '返回', exact: true }).count(), width > 760 ? 1 : 0);
      if (width > 760) {
        const button = await control.boundingBox(), frame = await panel.boundingBox();
        assert.ok(button.x > frame.x + frame.width / 2 && button.x + button.width < frame.x + frame.width);
        assert.ok(button.y >= frame.y && button.y < frame.y + 32);
      }
    }
    for (const [label, tab, included, excluded] of [['我的收藏','saved','收藏项目','喜欢项目'],['我的喜欢','liked','喜欢项目','收藏项目']]) {
      await sidebar.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: label, exact: true, level: 2 }).waitFor();
      await page.getByRole('link', { name: new RegExp(included) }).waitFor();
      assert.equal(await page.getByRole('link', { name: new RegExp(excluded) }).count(), 0);
      assert.equal(new URL(page.url()).searchParams.get('tab'), tab);
      await page.reload();
      await page.getByRole('link', { name: new RegExp(included) }).waitFor();
      await back();
    }
    await sidebar.getByRole('button', { name: '玩家资料', exact: true }).click();
    await page.locator('[name=name]').waitFor();
    assert.equal(await page.locator('[name=currentPassword]').count(), 0);
    await checkSettingsReturn('.player-profile-edit');
    await back();
    await sidebar.getByRole('button', { name: '账号设置', exact: true }).click();
    await page.locator('[name=currentPassword]').waitFor();
    assert.equal(await page.locator('[name=name]').count(), 0);
    await checkSettingsReturn('.player-account-settings');
    await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
    await back();
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
    console.log('通过 玩家空间收藏/喜欢/资料/账号独立入口、刷新与返回、手机左上资料及简洁记录', width);
  }
} finally { await browser.close(); }
