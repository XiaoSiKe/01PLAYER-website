import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const album = { eventId: 'mobile-gallery-preview', category: 'competition', name: '手机目录验证：这是一个较长的活动影像标题', photos: [
  { id: 'mobile-photo', title: '手机验证影像', category: 'competition', image: '/images/activity-photos/activity-05.jpg', date: '2035.12.01' },
] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function geometry(page, expected) {
  const handle = await page.waitForFunction(expected => {
    const e = document.querySelector('.pg-cell'), image = e?.querySelector('.pg-thumb');
    const cell = Number.parseFloat(e?.style.width);
    if (!e || !image || !Number.isFinite(cell) || expected && Math.abs(cell - expected) > .02) return false;
    return { cell, image: Number.parseFloat(getComputedStyle(image).width), height: Number.parseFloat(image.style.height),
      opacity: getComputedStyle(e).opacity, transform: e.style.transform };
  }, expected);
  return handle.jsonValue();
}
try {
  for (const width of [320, 390, 1440]) {
    const mobile = width <= 760;
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/site-content/manifest.json', route => route.fulfill({ json: { sections: { activityPhotos: [], competitionItems: [] } } }));
    await page.route('**/api/community/**', route => {
      const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
      return route.fulfill({ json: path === 'session' ? { user: null, demo: true } : path === 'albums' ? [album] : [] });
    });
    await page.goto(origin + '/?page=time-machine');
    const overview = await geometry(page);
    const mode = await page.locator('#pg-stage').getAttribute('data-presentation');
    assert.equal(mode, mobile ? 'bright' : 'spotlight');
    for (const selector of ['#pg-dim','#pg-spotlight','#pg-vignette']) {
      assert.equal(await page.locator(selector).evaluate(e => getComputedStyle(e).display), mobile ? 'none' : 'block');
    }
    if (mobile) {
      assert.equal(overview.opacity, '1');
      assert.match(overview.transform, /rotateY\(0deg\).*rotateX\(0deg\).*scale\(1\)/);
      await page.locator('.pg-thumb').first().tap();
      await page.locator('#pg-focus-card.on').waitFor();
      await page.waitForFunction(() => document.querySelector('#pg-focus-img')?.naturalWidth > 0);
      await page.setViewportSize({ width: width + 8, height: 780 });
      await page.waitForTimeout(550);
      const preview = await page.locator('#pg-focus-img').evaluate(e => {
        const r = e.getBoundingClientRect();
        return { width: r.width, ratio: r.width / r.height, natural: e.naturalWidth / e.naturalHeight };
      });
      assert.ok(Math.abs(preview.ratio - preview.natural) < .01);
      assert.ok(preview.width <= width + 8 - 30);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.body.classList.contains('pg-focused'));
      await page.setViewportSize({ width, height: 844 });
    }
    await page.locator('.tm-catalog-toggle').click();
    await page.getByRole('dialog', { name: '影像目录', exact: true }).getByRole('button', { name: '玩家计划', exact: true }).click();
    const label = page.locator('.tm-session-select .choice-menu__label');
    await label.waitFor();
    assert.equal(await label.textContent(), '全部场次');
    const category = await geometry(page, mobile ? overview.cell / .85 : overview.cell);
    assert.ok(Math.abs(overview.image / category.image - (mobile ? .85 : 1)) < .001);
    assert.ok(Math.abs(overview.height / category.height - (mobile ? .85 : 1)) < .001);
    const select = page.locator('.tm-session-select .language-switcher__trigger');
    if (mobile) {
      const box = await select.boundingBox();
      assert.ok(box.x <= 14 && box.width >= width * .5);
      assert.equal(await select.locator('.language-switcher__chevron').isVisible(), true);
    }
    await select.click();
    await page.getByRole('menuitemradio', { name: album.name, exact: true }).click();
    await page.waitForFunction(name => document.querySelector('.tm-session-select .choice-menu__label')?.textContent === name, album.name);
    assert.equal(await label.textContent(), album.name);
    assert.equal(new URL(page.url()).searchParams.get('event'), album.eventId);
    await geometry(page, category.cell * 1.3);
    if (mobile) {
      assert.ok(await label.evaluate(e => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1));
      assert.equal(await page.locator('.pg-cell').first().evaluate(e => getComputedStyle(e).opacity), '1');
    }
    await page.locator('.tm-catalog-toggle').click();
    await page.getByRole('dialog', { name: '影像目录', exact: true }).getByRole('button', { name: '全部影像', exact: true }).click();
    await geometry(page, overview.cell);
    assert.equal(await page.locator('.tm-session-select').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
    console.log('通过 时光机场次名称与展开选择、手机全览图片缩小15%、直接亮显与原图预览、桌面保留', width);
  }
} finally { await browser.close(); }
