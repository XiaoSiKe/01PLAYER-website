import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const source = '/plaza?q=AI';
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const path of ['/players','/plaza','/players?view=tickets','/pioneers','/mentors','/leadership','/?page=time-machine']) {
      await page.goto(origin + path + (path.includes('?') ? '&' : '?') + 'from=' + encodeURIComponent(source));
      const back = page.locator('.site-nav-return');
      await back.waitFor();
      const a = await back.boundingBox(), nav = await page.locator('.sm-toggle').boundingBox();
      if (path.includes('view=tickets')) {
        await page.locator('.web-registration').waitFor();
        assert.equal(await page.getByRole('heading',{name:'我的报名',exact:true,level:1}).count(),1);
        assert.equal(await page.locator('.registration-list-heading,.site-tickets-link').count(),0);
        assert.equal(await page.getByRole('main').getByRole('link',{name:'返回',exact:true}).count(),0);
      }
      if (width > 760) {
        assert.ok(a.y >= nav.y + nav.height + 6);
        assert.ok(Math.abs(a.x + a.width - nav.x - nav.width) < 1);
        if(path.startsWith('/players')||path==='/plaza') {
          assert.ok(a.width>=88 && a.height>=48);
          const topControl=await page.locator('.site-account-link').boundingBox();
          assert.ok(Math.abs(a.height-topControl.height)<1);
        }
      } else if (path.includes('time-machine')) {
        const catalog = await page.locator('.tm-catalog-toggle').boundingBox();
        assert.ok(a.x >= catalog.x + catalog.width);
        assert.ok(Math.abs(a.y - catalog.y) < 4);
      } else assert.ok(a.x + a.width <= nav.x);
      assert.equal(await back.getAttribute('href'), source);
      await back.click();
      await page.waitForURL(url => url.pathname === '/plaza' && url.searchParams.get('q') === 'AI');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log('通过 导师、先锋、头号玩家、广场、玩家计划、时光机返回位置与来源', width);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  await page.route('**/api/community/**', route => {
    const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
    return route.fulfill({ json: path === 'session' ? { user: null } : path.startsWith('profiles/')
      ? { id: 'return-profile', name: '公开玩家', university: '预览大学', projects: [], recruitments: [], avatar: '/images/branches/fzu-crest.png' } : [] });
  });
  for (const width of [320,390,600,1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['players','plaza']) {
      await page.goto(origin + '/' + section + '?view=player&user=return-profile&from=' + encodeURIComponent(source));
      await page.locator('.public-player-avatar img').waitFor();
      const avatar = await page.locator('.public-player-avatar').boundingBox();
      assert.ok(Math.abs(avatar.width - (width <= 420 ? 70.4 : width <= 760 ? 96.8 : 88)) < .1);
      const bodyReturn = page.locator('.public-player-page .community-page-return');
      if (width <= 760) {
        const back = page.locator('.site-nav-return'), nav = await page.locator('.sm-toggle').boundingBox();
        const bounds = await back.boundingBox();
        assert.ok(bounds.x + bounds.width <= nav.x && Math.abs(bounds.y + bounds.height / 2 - nav.y - nav.height / 2) < 2);
        assert.equal(await bodyReturn.isVisible(), false);
        await back.click();
      } else {
        assert.equal(await page.locator('.site-nav-return').count(), 0);
        await bodyReturn.getByRole('link', { name: '返回', exact: true }).click();
      }
      await page.waitForURL(url => url.pathname === '/plaza' && url.searchParams.get('q') === 'AI');
    }
  }
  await page.unroute('**/api/community/**');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(origin + '/cooperation?branch=fjnu#cooperation');
  const leader = page.locator('.branch-atlas__leader-profile');
  await leader.scrollIntoViewIfNeeded();
  await leader.click();
  await page.locator('.site-nav-return').waitFor();
  assert.match(await page.locator('.site-nav-return').getAttribute('href'), /^\/cooperation\?branch=fjnu#cooperation$/);
  await page.locator('.site-nav-return').click();
  await page.locator('.branch-atlas__school-heading[data-school="fjnu"]').waitFor();
  const event = { id: 'participation-preview', name: '同排参与按钮预览', status: 'active', category: 'competition', type: '赛事',
    date: '2035.12.01', registrationOpen: true, registrationMode: 'direct', submissionsOpen: true, location: '线上', rules: [], formFields: [] };
  await page.route('**/api/community/**', route => {
    const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
    return route.fulfill({ json: path === 'session' ? { user: null, demo: true } : path === 'events' ? [event] : path.startsWith('events/') ? event : [] });
  });
  for (const width of [320,390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/players?event=' + event.id);
    const join = page.locator('.event-entry').getByRole('link', { name: '参与赛事', exact: true });
    const submit = page.locator('.event-entry').getByRole('link', { name: '提交作品', exact: true });
    await join.waitFor();
    const a = await join.boundingBox(), b = await submit.boundingBox();
    assert.ok(Math.abs(a.y - b.y) < 1);
    assert.ok(a.x + a.width <= b.x);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.close();
  console.log('通过 分社成员来源与地图位置恢复、手机参与赛事和提交作品同排');
} finally { await browser.close(); }
