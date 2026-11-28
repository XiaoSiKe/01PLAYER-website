// Run against the seeded local demo with Playwright Core and an installed Chrome.
// PLAYWRIGHT_MODULE accepts a module name or a file URL when using an existing installation.
import assert from 'node:assert/strict';
import { historicalArchivePhotos } from '../src/time-machine/photos.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel:'chrome', headless:true });
const errors = [];

async function pageFor(width, touch) {
  const page = await browser.newPage({viewport:{width,height:844},hasTouch:touch,isMobile:touch});
  page.on('pageerror', err => errors.push(err.message));
  return page;
}


async function checkListingAlignment() {
  for (const width of [1440,390,320]) {
    const page=await pageFor(width,width<700);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(origin+'/players');
    await page.locator('.calendar-lead').first().waitFor();
    if(width>760)await page.waitForFunction(()=>Boolean(document.querySelector('.calendar-signup-word')?.style.fontSize));
    const top=await page.locator(width>760?'.calendar-lead':'.calendar-highlights').first().evaluate(el=>el.getBoundingClientRect().top);
    if(width<=760)assert.equal(await page.locator('.calendar-signup').count(),0);
    assert.equal(await page.getByText('选择活动，在官网报名',{exact:false}).count(),0);
    const tickets=await page.locator('.site-tickets-link').boundingBox();
    if(width>760){const account=await page.locator('.site-account-link').boundingBox();assert.ok(tickets.x+tickets.width<=account.x);}
    else assert.equal(await page.locator('.site-account-link').isVisible(),false);
    const words=await page.locator('.calendar-signup-word').evaluateAll(els=>els.map(el=>({font:parseFloat(getComputedStyle(el).fontSize),width:el.getBoundingClientRect().width,available:el.closest('.calendar-signup').clientWidth})));
    assert.ok(words.every(word=>word.font>28 && word.width<=word.available+1));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(origin+'/plaza');await page.locator('.plaza-popular').waitFor();
    assert.ok(Math.abs(top-await page.locator('.plaza-popular').evaluate(el=>el.getBoundingClientRect().top))<1);
    await page.close();
  }
  console.log('通过 玩家计划与广场顶部对齐、桌面动字保留、手机动字移除与顶部报名入口');
}

async function checkPublishedContent() {
  const page = await pageFor(390, true);
  const original = '那些疯狂到相信自己能够改变世界的人，正是改变世界的人！';
  const copy = text => ({ sections: {}, copy: { [original]: { 'zh-Hans': text } } });
  await page.route('**/site-content/manifest.json', route => route.fulfill({json:copy('已发布示例文案')}));
  await page.route('**/cms-api/site-preview?*', route => route.fulfill({json:copy('草稿预览示例文案')}));
  const introduction = page.locator('#work-title + p');
  await page.goto(origin + '/?lang=zh-Hans#work');
  assert.equal(await introduction.innerText(), '已发布示例文案');
  await page.goto(origin + '/?lang=zh-Hans&editPreview=fixture#work');
  assert.equal(await introduction.innerText(), '草稿预览示例文案');
  await page.unrouteAll();
  await page.route('**/site-content/manifest.json', route => route.fulfill({status:503}));
  await page.goto(origin + '/?lang=zh-Hans#work');
  assert.equal(await introduction.textContent(), original);
  await page.close();
  console.log('通过 官网已发布内容、草稿预览与默认内容回退');
}

async function checkRecruitmentReturn() {
  const page = await pageFor(1440, false);
  const filters = 'category=competition&q=AI';
  await page.goto(origin + '/players?' + filters);
  await page.locator('.calendar-card[href*="event=ai-build-sprint"]').click();
  await page.locator('.community-team-link').first().click();
  await page.getByRole('link', { name: '返回', exact: true }).click();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await page.getByRole('searchbox').waitFor();
  assert.equal(await page.getByRole('searchbox').inputValue(), 'AI');
  assert.equal(await page.getByRole('button', { name: '赛事', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.close();
  console.log('通过 招募详情返回活动并保留列表筛选');
}

async function checkSearch(route, width, touch) {
  const page = await pageFor(width,touch);
  const search = page.getByRole('searchbox');
  const card = page.locator(route==='players' ? '.calendar-card' : '.plaza-results .community-card-link');
  await page.goto(origin+'/'+route);
  await page.locator(route==='players' ? '.calendar-card' : '.plaza-popular .community-card-link').first().waitFor();
  if (route==='players') {
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('link',{name:'玩家空间',exact:true}).count(),0);
    assert.equal(await page.locator('.sm-header-actions .site-account-link').isVisible(),width>760);
  } else {
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('heading',{name:'热门项目',exact:true}).count(),0);
    assert.equal(await main.getByRole('link',{name:'玩家空间',exact:true}).count(),0);
    assert.equal(await main.getByRole('link',{name:'发布项目',exact:true}).count(),1);
  }
  if(width<=760) await page.getByRole('button',{name:route==='players'?'搜索玩家计划':'搜索项目或作者',exact:true}).click();
  await search.scrollIntoViewIfNeeded();
  const {y} = await search.boundingBox();
  await search.fill('不存在的演示结果32763');
  await (width<=760 ? page.getByRole('dialog',{name:route==='players'?'搜索玩家计划':'搜索项目或作者'}).locator('.community-empty') : page.locator('.community-empty')).waitFor();
  assert.ok(Math.abs((await search.boundingBox()).y-y)<3, '输入时搜索框应保持原位');
  assert.equal(await page.getByRole('button',{name:'清除筛选'}).count(),0);
  if (route==='players') assert.equal(await page.getByRole('heading',{name:'筛选结果'}).count(),0);
  await search.fill('');
  await page.waitForFunction(()=>!new URLSearchParams(location.search).has('q'));
  assert.equal(await search.inputValue(),'');
  const query = route==='players' ? '周末' : 'ＡＩ';
  await search.fill(query);
  await card.first().waitFor();
  const count = await card.count();
  if(width<=760) await page.getByRole('button',{name:'关闭搜索',exact:true}).click();
  await card.first().click();
  await page.getByRole('navigation',{name:route === 'players' ? '活动详情目录' : '项目详情目录'}).waitFor();
  assert.equal(await page.locator('.detail-share-return').getByRole('link',{name:'返回',exact:true}).count(),1);
  await page.locator('.detail-share-return').getByRole('link',{name:'返回',exact:true}).click();
  await card.first().waitFor();
  if(width<=760) await page.getByRole('button',{name:route==='players'?'搜索玩家计划':'搜索项目或作者',exact:true}).click();
  assert.equal(await search.inputValue(),width<=760?'':query);
  if(width<=760) await page.getByRole('button',{name:'关闭搜索',exact:true}).click();
  assert.equal(await card.count(),count);
  if (route==='plaza') {
    await page.goto(origin+'/plaza?source=removed-event');
    await page.locator('.plaza-popular .community-card-link').first().waitFor();
    assert.equal(new URL(page.url()).searchParams.has('source'),false);
    assert.equal(await page.getByRole('button',{name:'项目来源 · 全部来源'}).count(),1);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.close();
  console.log('通过',route,width,'筛选区精简、搜索、返回列表与无横向溢出');
}

async function checkLongChoiceMenu() {
  const page = await pageFor(390, true);
  const events = Array.from({length: 32}, (_, index) => ({id: 'choice-' + index, name: '测试活动 ' + (index + 1)}));
  await page.route('**/api/community/events', route => route.fulfill({json: events}));
  await page.route('**/api/community/projects', route => route.fulfill({json: events.map(event => ({
    id: 'project-' + event.id, eventId: event.id, name: '测试项目', summary: '测试列表', author: '测试玩家',
  }))}));
  await page.goto(origin + '/plaza');
  const source = page.getByRole('button', {name: '项目来源 · 全部来源'});
  await source.waitFor();
  assert.equal(await page.getByRole('button', {name: '招募中', exact: true}).count(), 0);
  assert.equal(await page.getByRole('button', {name: '活动 · 全部活动'}).count(), 0);
  await source.click();
  const sourceMenu = page.getByRole('menu');
  assert.deepEqual(await sourceMenu.getByRole('menuitemradio').allTextContents(), ['全部来源', '玩家计划', '自主投稿',...events.map(event=>event.name)]);
  await sourceMenu.getByRole('menuitemradio', {name:'玩家计划', exact:true}).click();
  const trigger = page.getByRole('button', {name: '项目来源 · 玩家计划'});
  await trigger.scrollIntoViewIfNeeded();
  const previousScroll = await page.evaluate(() => scrollY);
  await trigger.press('ArrowUp');
  const menu = page.getByRole('menu');
  const last = menu.getByRole('menuitemradio', {name: '测试活动 32'});
  await last.waitFor();
  assert.equal(await last.evaluate(el => el === document.activeElement), true);
  assert.ok(await menu.evaluate(el => el.scrollTop > 0));
  const measurements = await menu.evaluate(async el => {
    const trigger = document.getElementById(el.getAttribute('aria-labelledby'));
    const getRect = trigger.getBoundingClientRect;
    let reads = 0;
    trigger.getBoundingClientRect = () => { reads++; return getRect.call(trigger); };
    try {
      for (let i = 0; i < 20; i++) el.dispatchEvent(new Event('scroll'));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const internalReads = reads;
      for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('resize'));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return {internalReads, resizeReads: reads - internalReads, scrollY};
    } finally {
      delete trigger.getBoundingClientRect;
    }
  });
  assert.equal(measurements.internalReads, 0, '菜单内部滚动无需重新测量触发按钮');
  assert.equal(measurements.resizeReads, 1, '同一帧内的窗口事件只需定位一次');
  assert.equal(measurements.scrollY, previousScroll);
  await page.keyboard.press('Home');
  assert.ok(await menu.getByRole('menuitemradio', {name: '全部来源', exact: true}).evaluate(el => el === document.activeElement));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: '项目来源 · 测试活动 32'}).waitFor();
  assert.equal(await page.getByRole('button', {name: '项目来源 · 测试活动 32'}).evaluate(el => el === document.activeElement), true);
  await page.close();
  console.log('通过 长下拉列表定位、内部滚动、键盘选择与焦点恢复');
}

async function checkDeadline(shortcut, field, width, touch, phase = 'open') {
  const page = await pageFor(width, touch);
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await page.route('**/api/community/events/weekend-lab', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: {
      ...await response.json(), status: phase, registrationOpen: true, endsAt: null, registrationClosesAt: null,
      [field]: new Date(now + 60000).toISOString(),
    } });
  });
  await page.goto(origin + '/players?event=weekend-lab' + (shortcut ? '&view=register' : ''));
  if (shortcut) await page.getByRole('button', { name: '提交报名', exact: true }).waitFor();
  else await page.getByRole('link', { name: /^参与(赛事|沙龙|合作)$/ }).waitFor();
  await page.clock.fastForward(62000);
  if (shortcut) {
    await page.getByText('本场活动已停止接受报名。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '提交报名', exact: true }).count(), 0);
  } else {
    if (phase === 'open') await page.locator('.event-entry [data-event-status="closed"]').waitFor();
    else await page.getByText('报名已截止',{exact:true}).waitFor();
    assert.equal(await page.getByRole('link', { name: /^参与(赛事|沙龙|合作)$/ }).count(), 0);
    assert.equal(await page.getByRole('button', {name:/^参与(赛事|沙龙|合作)$/}).count(),0);
  }
  await page.close();
  console.log('通过 官网报名截止状态', shortcut ? '报名表' : '活动详情', width);
}

async function checkPublicAlbumWithoutSession() {
  const page = await pageFor(390, true);
  await page.route('**/api/community/session', route => route.fulfill({status:503, json:{error:'会话暂时不可用'}}));
  const history = historicalArchivePhotos[0];
  await page.route('**/api/community/albums?historical=1', route => route.fulfill({json:{
    albums: [{ eventId:'public-album', name:'已公开相册', category:'competition', date:'2026.11.27',
      photos:[{title:'公开照片', image:'/images/club-logo-white.svg'}] }],
    historicalPhotos: [{ id:history.id, fullImage:history.fullImage, title:'更新后的历史影像', credit:'新摄影署名' }],
  }}));
  await page.goto(origin+'/?page=time-machine&event=public-album');
  await page.locator('.tm-session-select').waitFor();
  assert.equal(await page.locator('.tm-wall-status').count(),0);
  assert.equal(await page.getByRole('button',{name:'添加本场照片'}).count(),0);
  await page.goto(origin+'/?page=time-machine&event='+encodeURIComponent(history.eventId));
  const editedPhoto = page.locator('.pg-cell[data-title="更新后的历史影像"]');
  await editedPhoto.waitFor({state:'attached'});
  assert.match(await editedPhoto.getAttribute('data-desc'), /新摄影署名/);
  await page.close();
  console.log('通过 会话不可用时仍可浏览公开活动相册');
}

try {
  await checkListingAlignment();
  await checkLongChoiceMenu();
  await Promise.all([checkDeadline(true, 'registrationClosesAt', 1100, false, 'active'), checkDeadline(false, 'registrationClosesAt', 1100, false, 'active')]);
  await Promise.all([checkPublishedContent(), checkRecruitmentReturn(), checkPublicAlbumWithoutSession()]);
  for(const width of [390,1440]) await Promise.all(['plaza','players'].map(route=>checkSearch(route,width,width===390)));
  for(const shortcut of [true,false]) await Promise.all([
    checkDeadline(shortcut,'registrationClosesAt',490,false),
    checkDeadline(shortcut,'endsAt',1100,true),
  ]);
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
