import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    for (const pinned of [0, 1, 3]) {
      const projects = ['a', 'b', 'c', 'd'].map((id, index) => ({
        id, name: 'Project ' + id, author: 'Preview author', ownerId: 'preview-author',
        status: 'approved', summary: 'Reaction regression', description: 'Project description',
        createdAt: `2035-01-0${index + 1}T00:00:00Z`, likes: [10, 5, 4, 0][index], saves: 0,
        liked: false, saved: false,
        ...(pinned === 1 && id === 'a' ? { homePinPosition: 1 } : pinned === 3 && index < 3 ? { homePinPosition: [2, 3, 1][index] } : {}),
      }));
      const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/community/**', route => {
        const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
        let json = [];
        if (path === 'session') json = { user: { id: 'reaction-user', name: 'Preview player', role: 'player' } };
        if (path === 'projects') json = projects;
        if (path.startsWith('projects/')) json = projects.find(project => project.id === path.slice(9));
        if (path.startsWith('reaction/')) {
          const project = projects.find(project => project.id === path.slice(9));
          const { kind, active } = route.request().postDataJSON();
          const flag = kind === 'like' ? 'liked' : 'saved', count = kind === 'like' ? 'likes' : 'saves';
          if (project[flag] !== active) project[count] += active ? 1 : -1;
          project[flag] = active;
          json = project;
        }
        return route.fulfill({ json });
      });
      await page.goto(origin + '/plaza');
      const cards = page.locator('.plaza-popular .community-list-card');
      await cards.first().waitFor();
      const order = () => cards.locator('.community-list-card-title').allTextContents();
      const initial = await order();
      if (pinned === 1) assert.equal(initial[0], 'Project a');
      if (pinned === 3) assert.deepEqual(initial, ['Project c', 'Project a', 'Project b']);
      const card = page.locator('.community-list-card').filter({ has: page.getByRole('link', { name: 'Project c', exact: true }) }).first();
      const color = (button) => button.locator('svg').evaluate(el => ({ color: getComputedStyle(el).color, fill: getComputedStyle(el).fill }));
      const waitColor = async (button, expected, selected = true) => page.waitForFunction(
        ({ svg, expected, selected }) => (getComputedStyle(svg).color === expected) === selected,
        { svg: await button.locator('svg').elementHandle(), expected, selected });
      for (const [label, activeLabel, expected] of [['点赞', '取消点赞', 'rgb(239, 68, 68)'], ['收藏', '取消收藏', 'rgb(234, 179, 8)']]) {
        await card.getByRole('button', { name: label, exact: true }).click();
        const active = card.getByRole('button', { name: activeLabel, exact: true });
        await active.waitFor();
        assert.deepEqual(await order(), initial, 'Reactions must not reorder featured projects');
        await waitColor(active, expected);
        assert.deepEqual(await color(active), { color: expected, fill: expected });
        await page.reload();
        await active.waitFor();
        assert.deepEqual(await order(), initial, 'Reload must preserve featured order');
        await active.click();
        const inactive = card.getByRole('button', { name: label, exact: true });
        await inactive.waitFor();
        await waitColor(inactive, expected, false);
        assert.notEqual((await color(inactive)).color, expected);
        assert.deepEqual(await order(), initial);
      }
      await page.getByRole('button', { name: /^项目排序/ }).click();
      await page.getByRole('menuitemradio', { name: '点赞最多', exact: true }).click();
      await page.waitForFunction(() => new URLSearchParams(location.search).get('sort') === 'popular');
      assert.deepEqual(await order(), initial, 'More-project sorting must not reorder the featured section');
      assert.equal(await page.locator('.plaza-results .community-list-card-title').first().textContent(), 'Project a');
      await card.getByRole('link', { name: 'Project c', exact: true }).click();
      const reactions = page.locator('.community-reactions');
      for (const [label, expected] of [['点赞', 'rgb(239, 68, 68)'], ['收藏', 'rgb(234, 179, 8)']]) {
        await reactions.getByRole('button', { name: new RegExp('^' + label) }).click();
        const active = reactions.locator('[aria-pressed="true"]').filter({ hasText: label });
        await active.waitFor();
        await waitColor(active, expected);
        assert.deepEqual(await color(active), { color: expected, fill: expected });
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log('通过 点赞/收藏图标颜色、取消与刷新、卡片/详情、优先项目排序', width, 'pinned slots:', pinned);
    }
  }
} finally { await browser.close(); }
