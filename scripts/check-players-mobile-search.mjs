import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const events = [
  { id: 'search-competition', name: '预览 AI 创造赛', category: 'competition', type: '赛事', status: 'open', homePinPosition: 1 },
  { id: 'search-salon', name: '预览周末沙龙', category: 'salon', type: '沙龙', status: 'active', homePinPosition: 2 },
  { id: 'search-cooperation', name: '预览合作项目交流与创作实践活动', category: 'activity', type: '合作', status: 'open' },
].map(event => ({ ...event, description: '浏览器独立搜索验收。', subtitle: '一起完成真实的小作品。', date: '2035.12.01 — 12.02',
  location: '线上', rules: [], formFields: [], registrationOpen: true }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/community/**', route => {
      const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
      const result = path === 'session' ? { user: null, demo: true } : path === 'events' ? events
        : path.startsWith('events/') ? events.find(event => event.id === path.slice(7)) : [];
      return route.fulfill({ json: result });
    });
    await page.goto(origin + '/players');
    await page.locator('.calendar-lead').first().waitFor();
    if (width > 760) {
      await page.waitForFunction(() => Boolean(document.querySelector('.calendar-signup-word')?.style.fontSize));
      const ticker = await page.locator('.calendar-signup').evaluate(el => {
      const line = el.querySelector('.calendar-signup-line'), word = el.querySelector('.calendar-signup-word');
      const r = el.getBoundingClientRect(), featured = document.querySelector('.calendar-featured').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, featuredTop: featured.top,
        matrix: new DOMMatrix(getComputedStyle(word).transform).d,
        height: line.getBoundingClientRect().height, size: parseFloat(line.style.getPropertyValue('--signup-line-size')),
        lines: el.querySelectorAll('.calendar-signup-line').length };
    });
      assert.equal(ticker.lines, 4);
      assert.deepEqual(await page.locator('.calendar-signup-word').allTextContents(), ['欢迎大家', '报名活动', '不当牢玩家', '不做 NPC']);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.reload();
      await page.waitForFunction(() => [...document.querySelectorAll('.calendar-signup-word')].map(el => el.textContent).join('|') === '01PLAYER|零一玩家|让一切|从此刻发生');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(ticker.matrix, 1);
      assert.ok(Math.abs(ticker.top - ticker.featuredTop) < 1);
      const field = page.getByRole('searchbox', { name: '搜索玩家计划' });
      await field.fill('预览');
      assert.equal(await page.locator('.calendar-cards .calendar-card').count(), 3);
      assert.equal(await page.getByRole('dialog', { name: '搜索玩家计划' }).count(), 0);
    } else {
      assert.equal(await page.locator('.calendar-signup').count(), 0);
      const trigger = page.getByRole('button', { name: '搜索玩家计划', exact: true });
      const baselineCards = await page.locator('.calendar-cards .calendar-card').allTextContents();
      const baselineUrl = page.url();
      const tickets = await page.locator('.calendar-program > .calendar-tickets-link').boundingBox();
      const heading = await page.locator('#calendar-title').boundingBox();
      assert.ok(tickets.y + tickets.height <= heading.y && tickets.height >= 48);
      assert.ok(Math.abs(tickets.width - (await page.locator('.calendar-program').boundingBox()).width) < 1);
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: '搜索玩家计划' });
      const field = dialog.getByRole('searchbox');
      const fieldTop = (await field.boundingBox()).y;
      await field.fill('预览');
      assert.equal(await dialog.locator('.community-search-result').count(), 3);
      assert.deepEqual(await page.locator('.calendar-cards .calendar-card').allTextContents(), baselineCards);
      assert.equal(page.url(), baselineUrl);
      assert.ok(Math.abs((await field.boundingBox()).y - fieldTop) < 1);
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
      await dialog.getByRole('link', { name: '预览周末沙龙', exact: true }).click();
      await page.getByRole('heading', { name: '预览周末沙龙', exact: true, level: 1 }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('event'), 'search-salon');
      await page.locator('.detail-share-return').getByRole('link', { name: '返回', exact: true }).click();
      await trigger.waitFor();
      await trigger.click();
      assert.equal(await field.inputValue(), '');
      await field.fill('不存在的活动32763');
      await dialog.getByText('没有找到符合条件的活动。', { exact: true }).waitFor();
      await field.press('Enter');
      assert.equal(await dialog.evaluate(el => el.open), true);
      await field.fill('创造赛');
      await field.press('ArrowDown');
      assert.ok(await dialog.getByRole('link', { name: '预览 AI 创造赛', exact: true }).evaluate(el => el === document.activeElement));
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: '预览 AI 创造赛', exact: true, level: 1 }).waitFor();
      await page.goto(origin + '/players?category=salon&filter=active&q=' + encodeURIComponent('预览'));
      await trigger.click();
      assert.equal(await field.inputValue(), '');
      await field.fill('预览');
      assert.equal(await dialog.locator('.community-search-result').count(), 1);
      await field.press('Enter');
      await page.getByRole('heading', { name: '预览周末沙龙', exact: true, level: 1 }).waitFor();
      const address = new URL(page.url());
      assert.equal(address.searchParams.get('category'), 'salon');
      assert.equal(address.searchParams.get('filter'), 'active');
      assert.equal(address.searchParams.get('q'), '预览');
    }
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
    console.log('通过 玩家计划手机动字移除、实时活动结果、点击与键盘跳转、筛选来源及桌面保留', width);
  }
} finally {
  await browser.close();
}
