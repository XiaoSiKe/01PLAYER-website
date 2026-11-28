import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const user = { id: 'stable-user', name: 'Preview player', role: 'player' };
    const projects = Array.from({ length: 8 }, (_, i) => ({ id: 'stable-' + i, name: 'Stable project ' + i,
      ownerId: 'author', author: 'Preview author', status: 'approved', summary: 'Stable card',
      createdAt: `2035-01-0${i + 1}T00:00:00Z`, likes: 0, saves: 0, liked: false, saved: false }));
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const reads = [], writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let held, failNext = false;
    function holdNext() {
      let start, release;
      const started = new Promise(resolve => { start = resolve; });
      const waiting = new Promise(resolve => { release = resolve; });
      held = { start, waiting };
      return { started, release };
    }
    await page.route('**/api/community/**', async route => {
      const path = new URL(route.request().url()).pathname.split('/api/community/')[1];
      if (path.startsWith('reaction/')) {
        writes.push(path);
        if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: 'Preview retry' } }); }
        const p = projects.find(p => p.id === path.slice(9)), { kind, active } = route.request().postDataJSON();
        const flag = kind === 'like' ? 'liked' : 'saved', count = kind === 'like' ? 'likes' : 'saves';
        if (p[flag] !== active) p[count] += active ? 1 : -1;
        p[flag] = active;
        const snapshot = { ...p };
        if (held) { const gate = held; held = null; gate.start(); await gate.waiting; }
        return route.fulfill({ json: snapshot });
      }
      reads.push(path);
      return route.fulfill({ json: path === 'session' ? { user } : path === 'projects' ? projects
        : path.startsWith('projects/') ? projects.find(p => p.id === path.slice(9)) : [] });
    });
    await page.goto(origin + '/plaza');
    const card = page.locator('.plaza-results .community-list-card').first();
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    const baselineReads = reads.length;
    const position = await card.evaluate(el => { window.__stableCard = el; return { y: scrollY, top: el.getBoundingClientRect().top }; });
    const gate = holdNext();
    await card.getByRole('button', { name: '点赞', exact: true }).click();
    await gate.started;
    assert.equal(await page.locator('.community-card-reaction:disabled').count(), 0, 'A reaction must not dim and disable every card');
    const like = card.getByRole('button', { name: '取消点赞', exact: true });
    assert.equal(await like.count(), 1, 'Reaction feedback must appear before the response');
    assert.equal((await like.textContent()).trim(), '1');
    await like.dispatchEvent('click');
    assert.equal(writes.length, 1, 'A repeated click must not duplicate an in-flight write');
    await card.getByRole('button', { name: '收藏', exact: true }).click();
    await card.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    gate.release();
    await page.waitForFunction(() => !document.querySelector('[data-reaction][aria-busy="true"]'));
    assert.equal(await card.getByRole('button', { name: '取消点赞', exact: true }).count(), 1);
    assert.equal(await card.getByRole('button', { name: '取消收藏', exact: true }).count(), 1);
    assert.equal(reads.length, baselineReads, 'A reaction must not refetch the whole page');
    const after = await card.evaluate(el => ({ same: el === window.__stableCard, y: scrollY, top: el.getBoundingClientRect().top }));
    assert.equal(after.same, true);
    assert.ok(Math.abs(after.y - position.y) < 1 && Math.abs(after.top - position.top) < 1, 'The viewport and card must stay in place');
    failNext = true;
    await like.click();
    await page.getByText('Preview retry', { exact: true }).waitFor();
    await like.waitFor();
    assert.equal((await like.textContent()).trim(), '1', 'A failed write must restore its prior count');
    await like.click();
    await card.getByRole('button', { name: '点赞', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-reaction][aria-busy="true"]'));
    await card.locator('.community-list-card-title a').click();
    const reactions = page.locator('.community-reactions');
    await reactions.waitFor();
    const detailReads = reads.length, detailNode = await reactions.elementHandle();
    const detailGate = holdNext();
    await reactions.getByRole('button', { name: /^点赞/ }).click();
    await detailGate.started;
    assert.equal(await reactions.getByRole('button', { name: /^已点赞/ }).count(), 1);
    assert.equal(await reactions.locator(':disabled').count(), 0);
    detailGate.release();
    await page.waitForFunction(() => !document.querySelector('[data-reaction][aria-busy="true"]'));
    assert.equal(reads.length, detailReads);
    assert.equal(await detailNode.evaluate(el => el.isConnected), true);
    assert.deepEqual(errors, []);
    await page.close();
    console.log('通过 无整页重读/全局闪烁、即时反馈、节点与滚动稳定、并发与去重、失败恢复', width);
  }
} finally { await browser.close(); }
