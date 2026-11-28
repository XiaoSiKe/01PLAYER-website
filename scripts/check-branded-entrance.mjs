// Run against the seeded local preview with Playwright Core and Chrome.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome' });
const routes = [
  ['/earth'],
  ['/?page=time-machine'],
  ['/players'],
  ['/players?event=ai-build-sprint'],
  ['/plaza'],
  ['/plaza?project=study-map'],
  ['/plaza?view=login', '.account-access'],
  ['/plaza?view=login&mode=signup', '.account-access'],
];

async function readEntrance(page, route, region = '.staggered-menu-header') {
  await page.goto(origin + route);
  const heading = page.locator(`${region} .account-title`);
  await heading.locator('.account-logo-outline').waitFor({ state: 'attached' });
  return heading.evaluate(element => {
    const logo = element.querySelector('.account-logo-outline');
    const text = element.querySelector('.account-title-outline tspan');
    const masks = [...element.querySelectorAll('.account-title-wipe')];
    // SVG layout transitions are separate from the logo and title keyframes.
    const animated = [logo, text, ...masks].flatMap(node => node.getAnimations())
      .filter(animation => animation instanceof CSSAnimation);
    const freeze = time => animated.forEach(animation => {
      animation.pause();
      animation.currentTime = time;
    });
    const dash = node => parseFloat(getComputedStyle(node).strokeDashoffset);
    const fills = () => masks.map(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a);
    freeze(0);
    const start = [dash(logo), dash(text)];
    freeze(300);
    const during = {
      dash: [dash(logo), dash(text)],
      strokes: [logo, text].map(node => getComputedStyle(node).stroke),
      fills: fills(),
    };
    freeze(2500);
    return {
      start, during, finished: fills(),
      theme: document.documentElement.dataset.theme,
      visible: getComputedStyle(element).visibility === 'visible' && logo.getBoundingClientRect().width > 0,
      animations: animated.map(animation => animation.animationName),
    };
  });
}

try {
  const failures = [];
  for (const [theme, width] of [['dark', 1440], ['light', 1440], ['dark', 390], ['light', 390]]) {
    const context = await browser.newContext({
      viewport: { width, height: 850 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'no-preference',
    });
    await context.addInitScript(theme => localStorage.setItem('01ai-theme', theme), theme);
    const page = await context.newPage();
    for (const [route, region] of routes) {
      const state = await readEntrance(page, route, region);
      try {
        assert.equal(state.theme, theme);
        assert.ok(state.visible, '标识和标题必须位于可见区域');
        assert.ok(state.animations.includes('account-title-draw') && state.animations.includes('account-title-wipe'));
        assert.ok(state.during.dash.every((offset, index) => offset >= 0 && offset < state.start[index]), '描边必须向前绘制');
        assert.ok(state.during.strokes.every(stroke => stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)'), '入场时 Logo 和标题都必须有可见描边');
        assert.deepEqual(state.during.fills, [0, 0]);
        assert.deepEqual(state.finished, [1, 1]);
        console.log(`通过 ${theme} ${width}px ${route}`);
      } catch (error) {
        failures.push(`${theme} ${width}px ${route}：${error.message} (${state.during.strokes.join(' / ')})`);
      }
    }
    await context.close();
  }
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  const state = await readEntrance(reduced, '/earth');
  assert.deepEqual(state.animations, []);
  assert.deepEqual(state.during.fills, [1, 1]);
  await reduced.close();
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
