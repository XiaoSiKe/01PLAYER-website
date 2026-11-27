// Run against the seeded local demo with Playwright Core and an installed Chrome.
// PLAYWRIGHT_MODULE accepts a module name or a file URL when using an existing installation.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel:'chrome', headless:true });
const errors = [];

async function pageFor(width, touch) {
  const page = await browser.newPage({viewport:{width,height:844},hasTouch:touch,isMobile:touch});
  page.on('pageerror', err => errors.push(err.message));
  return page;
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
  assert.equal(await introduction.innerText(), original);
  await page.close();
  console.log('通过 官网已发布内容、草稿预览与默认内容回退');
}

async function checkRecruitmentReturn() {
  const page = await pageFor(1440, false);
  const filters = 'category=competition&q=AI';
  await page.goto(origin + '/players?' + filters);
  await page.locator('.calendar-lead[href*="event=ai-build-sprint"]').click();
  await page.locator('.community-team-link').first().click();
  await page.getByRole('link', { name: '本场全部招募', exact: true }).click();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await page.getByRole('searchbox').waitFor();
  assert.equal(await page.getByRole('searchbox').inputValue(), 'AI');
  assert.equal(await page.getByRole('button', { name: '比赛', exact: true }).getAttribute('aria-pressed'), 'true');
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
    assert.equal(await main.getByRole('button',{name:'微信小程序',exact:true}).count(),0);
    assert.ok(await page.locator('.sm-header-actions .site-account-link').isVisible());
  } else {
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('heading',{name:'热门项目',exact:true}).count(),0);
    assert.equal(await main.getByRole('link',{name:'玩家空间',exact:true}).count(),0);
    assert.equal(await main.getByRole('link',{name:'发布项目',exact:true}).count(),0);
  }
  await search.scrollIntoViewIfNeeded();
  const {y} = await search.boundingBox();
  await search.fill('不存在的演示结果32763');
  await page.locator('.community-empty').waitFor();
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
  await card.first().click();
  await page.getByRole('navigation',{name:route === 'players' ? '活动详情目录' : '项目详情目录'}).waitFor();
  assert.equal(await page.locator('a.discovery-detail-back').count(),0);
  await page.goBack();
  await card.first().waitFor();
  assert.equal(await search.inputValue(),query);
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
  assert.equal(await page.getByRole('button', {name: '赛事 · 全部赛事'}).count(), 0);
  await source.click();
  const sourceMenu = page.getByRole('menu');
  assert.deepEqual(await sourceMenu.getByRole('menuitemradio').allTextContents(), ['全部来源', '零一赛事', '自主投稿']);
  await sourceMenu.getByRole('menuitemradio', {name:'零一赛事', exact:true}).click();
  const trigger = page.getByRole('button', {name: '赛事 · 全部赛事'});
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
  assert.ok(await menu.getByRole('menuitemradio', {name: '全部赛事', exact: true}).evaluate(el => el === document.activeElement));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: '赛事 · 测试活动 32'}).waitFor();
  assert.equal(await page.getByRole('button', {name: '赛事 · 测试活动 32'}).evaluate(el => el === document.activeElement), true);
  await page.close();
  console.log('通过 长下拉列表定位、内部滚动、键盘选择与焦点恢复');
}

async function checkDeadline(shortcut, field, width, touch) {
  const page = await pageFor(width,touch);
  const now = Date.now();
  await page.clock.install({time:new Date(now)});
  const path = '/api/community/events/weekend-lab';
  const requests = new Set();
  page.on('request', r => { const url=new URL(r.url()); if(url.pathname.startsWith('/api/community/')) requests.add(url.pathname); });
  const open = event => ({...event,registrationOpen:true,endsAt:null,registrationClosesAt:null,[field]:new Date(now+60000).toISOString()});
  await page.route('**'+path, async route => {
    const response = await route.fetch();
    await route.fulfill({ json: open(await response.json()) });
  });
  if(shortcut) {
    await page.route(/\/api\/community\/(projects|session|recruitments)/,route=>route.fulfill({status:503,json:{error:'此服务暂时不可用'}}));
  }
  let unavailable = shortcut && !touch;
  await page.route('**'+path+'/wechat', route => {
    if (unavailable) {
      return route.fulfill({json:{available:false,reason:'微信正在恢复',retryAfterSeconds:5}});
    }
    return route.fulfill({json:{available:true,urlLink:'https://example.test/fixture-wechat-link',codeUrl:'/fixture-code.svg'}});
  });
  await page.route('**/fixture-code.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"/>'}));
  await page.goto(origin+'/players?event=weekend-lab'+(shortcut?'&view=register':''));
  if (shortcut && !touch) {
    await page.getByText('微信正在恢复').waitFor();
    assert.equal(await page.locator('.signup-panel button').isDisabled(), true);
    await page.clock.fastForward(5500);
    unavailable = false;
    await page.getByRole('button',{name:'重新获取报名入口'}).click();
  }
  const link = page.getByRole('link',{name:'打开小程序报名'});
  const code = page.getByRole('img',{name:/报名码/});
  await (touch ? link : code).waitFor();
  assert.equal(await (touch ? code : link).count(),0);
  const info = page.getByRole('complementary',{name:'活动信息'});
  if(shortcut) assert.deepEqual([...requests].sort(),[path,path+'/wechat']);
  else {
    assert.ok(requests.has(path) && !requests.has('/api/community/events'), '活动详情只读取目标场次');
    const signup = info.getByRole('region',{name:'活动报名'});
    assert.ok(await signup.getByText('参与方式',{exact:true}).isVisible());
    assert.ok(await signup.getByRole('heading',{name:'微信小程序搜索「零一玩家」，',exact:true}).isVisible());
    assert.ok(await signup.getByText('无需登录，直接填写报名信息！',{exact:true}).isVisible());
    assert.equal(await signup.locator('.border-glow-content').count(),0);
    assert.ok(await signup.locator(touch ? 'a.signup-mobile' : 'img').isVisible());
  }
  await page.clock.fastForward(62000);
  await page.getByRole('heading',{name:'报名截止'}).waitFor();
  assert.equal(await link.count(),0); assert.equal(await code.count(),0);
  if(!shortcut) assert.equal(await info.locator('.calendar-labels span').first().innerText(),'报名截止');
  await page.close();
  console.log('通过',shortcut?'匿名报名链接':'活动详情',field,touch?'触屏':'桌面');
}

try {
  await checkLongChoiceMenu();
  await Promise.all([checkPublishedContent(), checkRecruitmentReturn()]);
  for(const width of [390,1440]) await Promise.all(['plaza','players'].map(route=>checkSearch(route,width,width===390)));
  for(const shortcut of [true,false]) await Promise.all([
    checkDeadline(shortcut,'registrationClosesAt',490,false),
    checkDeadline(shortcut,'endsAt',1100,true),
  ]);
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
