import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const event = { id: 'plaza-preview-event', name: '浏览器测试活动', status: 'active', category: 'competition', type: '赛事', rules: [], formFields: [] };
const projects = [
  { id: 'plaza-preview-a', name: 'AI 学习助手', author: '项目作者甲', homePinPosition: 1, recruitment: {}, likes: 3 },
  { id: 'plaza-preview-b', name: 'AI 校园日历', author: '项目作者乙', homePinPosition: 2, eventId: event.id, likes: 15 },
  { id: 'plaza-preview-c', name: 'AI 实践资料整理与项目创作工具', author: '项目作者丙', homePinPosition: 3, likes: 1 },
].map((project, index) => ({ ...project, ownerId: 'preview-author-' + index, summary: '方便学习与创作的工具', description: '搜索与项目详情的独立浏览器验证。',
  imageUrl: '/images/club-logo-white.svg', bannerUrl: '/images/club-logo-white.svg', status: 'approved', example: true, saves: 2,
  createdAt: '2035-12-0' + (index + 1) + 'T00:00:00Z' }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/community/**', route => {
      const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
      return route.fulfill({ json: path === 'session' ? { user: null, demo: true } : path === 'events' ? [event]
        : path.startsWith('events/') ? event : path === 'projects' ? projects : path.startsWith('projects/') ? projects.find(p => p.id === path.slice(9)) : [] });
    });
    await page.goto(origin + '/plaza');
    await page.locator('.plaza-popular .community-list-card').first().waitFor();
    for (const card of await page.locator('.plaza-popular .community-list-card').all()) {
      const author = await card.locator('.community-card-author').boundingBox();
      for (const tag of await card.locator('.community-badge,.community-pin-badge').all()) {
        const rect = await tag.boundingBox();
        if (width <= 760) assert.ok(rect.y >= author.y + author.height, 'author must have a separate row');
        else assert.ok(Math.abs(rect.y + rect.height / 2 - author.y - author.height / 2) < 1);
      }
    }
    if (width <= 760) {
      const trigger = page.getByRole('button', { name: '搜索项目或作者', exact: true });
      const baselineCards = await page.locator('.plaza-results .community-list-card').allTextContents();
      const baselineUrl = page.url();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: '搜索项目或作者' });
      const input = dialog.getByRole('searchbox');
      const top = (await input.boundingBox()).y;
      await input.fill('AI');
      assert.equal(await dialog.locator('.community-search-result').count(), 3);
      assert.deepEqual(await page.locator('.plaza-results .community-list-card').allTextContents(), baselineCards);
      assert.equal(page.url(), baselineUrl);
      assert.ok(Math.abs((await input.boundingBox()).y - top) < 1);
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
      await dialog.getByRole('link', { name: 'AI 校园日历', exact: true }).click();
      await page.getByRole('navigation', { name: '项目详情目录' }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('project'), 'plaza-preview-b');
      await page.locator('.detail-share-return').getByRole('link', { name: '返回', exact: true }).click();
      await trigger.click();
      assert.equal(await input.inputValue(), '');
      await input.fill('不存在的项目32763');
      await dialog.getByText('没有找到符合条件的项目。', { exact: true }).waitFor();
      await input.press('Enter');
      assert.equal(await dialog.evaluate(el => el.open), true);
      await input.fill('项目作者丙');
      assert.equal(await dialog.locator('.community-search-result').count(), 1);
      await input.press('ArrowDown');
      assert.ok(await dialog.locator('.community-search-result').evaluate(el => el === document.activeElement));
      await page.keyboard.press('Enter');
      await page.getByRole('navigation', { name: '项目详情目录' }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('project'), 'plaza-preview-c');
      await page.goto(origin + '/plaza?source=club&sort=popular&q=AI');
      await trigger.click();
      assert.equal(await input.inputValue(), '');
      await input.fill('AI');
      assert.equal(await dialog.locator('.community-search-result').count(), 1);
      await input.press('Enter');
      await page.getByRole('navigation', { name: '项目详情目录' }).waitFor();
      const address = new URL(page.url());
      for (const [key, value] of Object.entries({ source: 'club', sort: 'popular', q: 'AI' })) assert.equal(address.searchParams.get(key), value);
    } else {
      await page.getByRole('searchbox', { name: '搜索项目或作者' }).fill('AI');
      assert.equal(await page.getByRole('dialog', { name: '搜索项目或作者' }).count(), 0);
      assert.equal(await page.locator('.plaza-results .community-list-card').count(), 3);
    }
    await page.evaluate(() => scrollTo(0, 200));
    await page.waitForTimeout(150);
    const glass = await page.locator('.sm-header-glass').evaluate(el => ({ height: el.getBoundingClientRect().height, header: document.querySelector('.staggered-menu-header').getBoundingClientRect().height, mask: getComputedStyle(el).maskImage }));
    assert.ok(Math.abs(glass.height - glass.header - 8) < .1);
    assert.ok(glass.mask.startsWith('linear-gradient('));
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
    console.log('通过 广场手机作者分行、即时项目搜索、点击/键盘跳转与来源、顶部渐变及桌面保留', width);
  }
} finally {
  await browser.close();
}
