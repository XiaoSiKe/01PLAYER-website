// Read-only browser regression for results inside the atlas search dialog.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height, path] of [[1440, 900, '/cooperation'], [390, 844, '/#cooperation'], [320, 844, '/cooperation'], [667, 375, '/cooperation']]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + path);
    const atlas = page.locator('.branch-atlas');
    const trigger = atlas.getByRole('button', { name: '搜索分社或高校', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '搜索分社或高校', exact: true });
    const input = dialog.getByRole('searchbox');
    const inputTop = (await input.boundingBox()).y;
    await input.fill('福州');
    const target = dialog.getByRole('button', { name: '查看福建师范大学分社', exact: true });
    await target.waitFor({ timeout: 3000 });
    assert.ok(Math.abs((await input.boundingBox()).y - inputTop) < 1, 'showing matches must not move the input');
    assert.ok(await dialog.locator('.branch-atlas__school-row').count() > 1);
    assert.equal(await dialog.getByText('定位', { exact: true }).count(), 0);
    assert.ok(await input.evaluate(el => el.getAttribute('aria-controls') === el.closest('dialog').querySelector('.community-filter-search-results').id));
    await target.click();
    await dialog.waitFor({ state: 'hidden' });
    await atlas.locator('.branch-atlas__school-heading[data-school="fjnu"]').waitFor();
    await atlas.getByRole('button', { name: '在地图中查看福建师范大学', exact: true }).waitFor();
    assert.equal(await atlas.getAttribute('data-view'), 'school');
    assert.equal(await atlas.getByRole('button', { name: '在地图中查看福建师范大学', exact: true }).getAttribute('aria-pressed'), 'true');

    await trigger.click();
    await input.fill('没有这所高校');
    await dialog.getByText('暂时没有找到', { exact: true }).waitFor();
    await input.press('Enter');
    assert.equal(await dialog.evaluate(el => el.open), true);
    await input.fill('福理工');
    await input.press('ArrowDown');
    assert.equal(await dialog.evaluate(el => el.open), true);
    assert.ok(await dialog.getByRole('button', { name: '查看福建理工大学分社', exact: true }).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    await atlas.locator('.branch-atlas__school-heading[data-school="fjut"]').waitFor();
    await page.waitForFunction(() => document.querySelector('.branch-atlas__school-heading h3') === document.activeElement);

    await trigger.click();
    await input.fill('福理工');
    await input.press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.branch-atlas__school-heading h3') === document.activeElement);

    await trigger.click();
    await input.fill('闽江');
    await input.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })));
    assert.equal(await dialog.evaluate(el => el.open), true);
    await input.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true })));
    assert.equal(await dialog.evaluate(el => el.open), true);
    assert.equal(await input.inputValue(), '闽江');
    await input.press('Enter');
    await dialog.waitFor({ state: 'hidden' });
    await atlas.locator('.branch-atlas__school-heading[data-school="mju"]').waitFor();
    await trigger.click();
    await input.fill('福州');
    await input.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    await trigger.click();
    assert.equal(await input.inputValue(), width <= 760 ? '' : '福州');
    await input.fill('');
    assert.equal(await dialog.locator('.branch-atlas__school-row').count(), 0);
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const ids = await atlas.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(errors, []);
    await page.close();
    console.log('通过 分社搜索实时弹出结果、点击定位、键盘、无结果、输入法和关闭恢复', width, height, path);
  }
} finally {
  await browser.close();
}
