import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    await page.locator('.hero-founded-button').waitFor();
    const buttonStyles = await page.locator('.hero-founded-button,.hero-entry[data-entry="players"] .specular-button').evaluateAll(nodes =>
      nodes.map(node => ({ radius: getComputedStyle(node).borderRadius, fx: Boolean(node.querySelector('.specular-button__fx')) })));
    assert.deepEqual(buttonStyles[0], buttonStyles[1]);
    assert.equal(buttonStyles[0].fx, true);
    assert.equal(await page.locator('.hero-founded-button').getAttribute('href'), '#about');

    await page.goto(origin + '/cooperation');
    const atlas = page.locator('.branch-atlas');
    await atlas.locator('.branch-atlas__school-list').waitFor();
    const background = await atlas.locator('.branch-atlas__school-list').innerText();
    const searchTrigger = atlas.getByRole('button', { name: '搜索分社或高校', exact: true });
    const dialog = page.getByRole('dialog', { name: '搜索分社或高校' });
    for (const close of ['button', 'escape', 'backdrop']) {
      await searchTrigger.click();
      const field = dialog.getByRole('searchbox');
      assert.equal(await field.inputValue(), '');
      await field.fill('师范');
      await dialog.locator('.branch-atlas__school-row').first().waitFor();
      assert.equal(await atlas.locator('.branch-atlas__school-list').innerText(), background);
      assert.equal(await atlas.getAttribute('data-view'), 'china');
      if (close === 'button') await dialog.getByRole('button', { name: '关闭搜索' }).click();
      else if (close === 'escape') await field.press('Escape');
      else await page.mouse.click(2, 2);
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('.branch-atlas dialog input').value === '');
    }

    await page.goto(origin + '/earth');
    await page.locator('.guide-folders').waitFor();
    const guide = page.locator('#guide-content');
    const guideBefore = await guide.innerText();
    await guide.getByRole('button', { name: /^搜索/ }).click();
    const guideDialog = page.getByRole('dialog', { name: '搜索攻略' });
    const guideInput = guideDialog.getByRole('searchbox');
    const inputTop = (await guideInput.boundingBox()).y;
    await guideInput.fill('攻略');
    await guideDialog.locator('.guide-search-results a').first().waitFor();
    assert.equal(await guide.innerText(), guideBefore);
    assert.ok(Math.abs((await guideInput.boundingBox()).y - inputTop) < 1);
    await guideInput.press('Escape');
    await guideDialog.waitFor({ state: 'hidden' });
    await guide.getByRole('button', { name: /^搜索/ }).click();
    assert.equal(await guideInput.inputValue(), '');
    await guideInput.fill('攻略');
    await guideDialog.getByRole('link', { name: '攻略首页', exact: true }).click();
    await guideDialog.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).hash, '#overview');

    for (const [route, name] of [['/pioneers','杨晗'], ['/leadership','零一扬']]) {
      await page.goto(origin + route);
      const form = page.locator('.pioneers-search'), input = form.getByRole('searchbox');
      await input.fill(name);
      await form.locator('.pioneers-search__result').first().waitFor();
      await page.locator('.sm-toggle').focus();
      assert.equal(await input.inputValue(), '');
      await input.fill(name);
      await form.locator('.pioneers-search__result').first().click();
      assert.equal(await input.inputValue(), '');
    }

    await page.goto(origin + '/?project=knowledge');
    const entries = page.locator('.demo-knowledge-list article');
    await entries.first().waitFor();
    const entriesBefore = await entries.allTextContents();
    await page.getByRole('button', { name: '搜索概念、提示词、网页……', exact: true }).click();
    const demoDialog = page.getByRole('dialog', { name: '搜索概念、提示词、网页……' });
    await demoDialog.getByRole('searchbox').fill('提示词');
    assert.deepEqual(await entries.allTextContents(), entriesBefore);
    await demoDialog.getByRole('link', { name: '写出更清楚的提示词', exact: true }).click();
    await demoDialog.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).hash, '#knowledge-entry-1');
    await page.getByRole('button', { name: '搜索概念、提示词、网页……', exact: true }).click();
    assert.equal(await demoDialog.getByRole('searchbox').inputValue(), '');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('通过 手机搜索背景不变、关闭清空、分社/攻略/成员/知识库结果跳转、成立按钮光效', width);
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(origin + '/');
  await page.locator('.hero-founded-button').waitFor();
  for (let i = 0; i < 2; i++) {
    const styles = await page.locator('.hero-founded-button,.hero-entry[data-entry="players"] .specular-button').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      return [style.borderRadius, style.getPropertyValue('--sb-text-color'), style.getPropertyValue('--sb-tint'), Boolean(node.querySelector('.specular-button__fx'))];
    }));
    assert.deepEqual(styles[0], styles[1]);
    await page.locator('.theme-toggle').click();
  }
  await page.close();
} finally { await browser.close(); }
