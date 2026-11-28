import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommunityApi } from '../server/community-api.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const directory = await mkdtemp(join(tmpdir(), '01player-registration-'));
const secret = 'local-test-only-bridge-secret';
const api = createCommunityApi({ demo: true, dataFile: join(directory, 'community.json'), staffSecret: secret });
const server = createServer(api);
await new Promise(done => server.listen(0, '127.0.0.1', done));
const apiOrigin = 'http://127.0.0.1:' + server.address().port;
const sitePort = Number(process.env.REGISTRATION_TEST_PORT || 5195);
const origin = 'http://127.0.0.1:' + sitePort;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(sitePort), '--strictPort'], {
  env: { ...process.env, PLAYER_ORIGIN: apiOrigin }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
vite.stdout.on('data', data => { output += data; });
vite.stderr.on('data', data => { output += data; });
let browser;
async function request(path, body, staff = false) {
  const response = await fetch(apiOrigin + '/api/community/' + path, {
    headers: { 'Content-Type': 'application/json', 'X-Community-Request': '1', ...(staff ? { 'X-01-Staff-Secret': secret } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
async function event(id, registrationMode, location='线上') {
  await request('staff/events', {
    id, name: '官网报名测试 · ' + id, description: '浏览器端到端报名测试', startsAt: '2035-12-01T10:00:00+08:00',
    endsAt: '2035-12-01T18:00:00+08:00', location, registrationMode,
    ...(id === 'web-direct' ? { ticketGroupQrUrl: '/images/join-official-wechat-qr.png' } : {}),
    formFields: [
      { id: 'major', label: '专业', type: 'text', required: true },
      { id: 'idea', label: '参与想法', type: 'textarea', required: true },
      { id: 'track', label: '方向', type: 'select', required: true, options: ['开发', '设计'] },
      { id: 'skills', label: '希望尝试', type: 'multiselect', required: true, options: ['产品', '研究'] },
    ],
  }, true);
  await request('staff/events/' + id + '/publish', {}, true);
}
async function fill(page, id, contact) {
  await page.goto(origin + '/players?view=register&event=' + id);
  await page.getByLabel('姓名或昵称').fill('官网测试玩家');
  await page.getByLabel('电话号码').fill(contact);
  await page.getByLabel('微信（选填）').fill('player_wechat');
  await page.getByLabel('专业', { exact: true }).fill('计算机');
  await page.getByLabel('参与想法', { exact: true }).fill('做一个真实项目');
  await page.getByLabel('方向', { exact: true }).selectOption('设计');
  await page.getByRole('checkbox', { name: '研究', exact: true }).check();
}
async function ticket(page, title) {
  await page.getByRole('article', { name: '报名票根' }).getByRole('heading', { name: title, exact: true }).waitFor();
  return new URL(page.url()).searchParams.get('receipt');
}
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt === 79) throw Error(output);
    await new Promise(done => setTimeout(done, 200));
  }
  await event('web-direct', 'direct');
  await event('web-review', 'review');
  await event('web-rejected', 'review');
  await event('web-race', 'direct');
  await event('web-account', 'direct');
  await event('web-offline','direct','线下，福州 · 福州大学旗山校区');
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  await page.route('**/api/community/events/web-direct/registrations', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort('failed');
  });
  await fill(page, 'web-direct', '13800000000');
  assert.equal(await page.getByText('查看我的报名',{exact:true}).count(),0);
  const submitRect=await page.getByRole('button',{name:'提交报名',exact:true}).boundingBox();
  const returnRect=await page.locator('.registration-form-heading').getByRole('link',{name:'返回',exact:true}).boundingBox();
  assert.ok(returnRect.y<submitRect.y);
  assert.equal(await page.locator('.registration-submit-row').getByRole('link',{name:'返回',exact:true}).count(),0);
  await page.getByRole('button', { name: '提交报名', exact: true }).click();
  await page.getByRole('button', { name: '重试并确认报名', exact: true }).waitFor();
  await page.unroute('**/api/community/events/web-direct/registrations');
  await page.reload();
  await page.getByRole('button', { name: '重试并确认报名', exact: true }).click();
  const directId = await ticket(page, '报名成功');
  await page.getByText('尊敬的官网测试玩家：',{exact:true}).waitFor();
  await page.getByText('体验票根',{exact:true}).waitFor();
  assert.equal(await page.getByText('示例回执',{exact:true}).count(),0);
  const ticketBox=page.getByRole('article',{name:'报名票根'});
  await ticketBox.getByRole('img', { name: '活动进群二维码' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.registration-ticket-invite img')?.naturalWidth > 0);
  await ticketBox.getByText('欢迎加入活动交流群',{exact:true}).waitFor();
  const qrBox=await ticketBox.locator('.registration-ticket-qr').boundingBox(),caption=await ticketBox.locator('.registration-ticket-invite figcaption').boundingBox();
  assert.ok(caption.y>=qrBox.y+qrBox.height);
  assert.deepEqual(await ticketBox.locator('.registration-event-facts dt').allTextContents(),['活动时间','参与方式','活动地点']);
  assert.equal(await ticketBox.locator('.registration-event-facts dd').nth(1).innerText(),'线上');
  const headingRect=await ticketBox.getByRole('heading',{name:'报名成功',exact:true}).boundingBox();
  const sealRect=await ticketBox.locator('.registration-ticket-seal').boundingBox();
  assert.ok(Math.abs((headingRect.y+headingRect.height/2)-(sealRect.y+sealRect.height/2))<2 && sealRect.x+sealRect.width<=headingRect.x);
  assert.equal(await page.locator('.registration-receipt-status > .discovery-detail-back').innerText(),'返回');
  assert.equal(await page.getByRole('link',{name:'详情',exact:true}).count(),0);
  const refreshRect=await page.getByRole('button',{name:'刷新状态',exact:true}).boundingBox();
  const backRect=await page.locator('.registration-receipt-status').getByRole('link',{name:'返回',exact:true}).boundingBox();
  assert.ok(refreshRect.x<backRect.x && Math.abs((refreshRect.y+refreshRect.height/2)-(backRect.y+backRect.height/2))<2);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button',{name:'保存票根',exact:true}).click();
  const download = await downloaded;
  if(process.env.TICKET_CAPTURE) await download.saveAs(process.env.TICKET_CAPTURE);
  const png = await readFile(await download.path());
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.ok(png.length>10000,'票根图片应包含完整内容');
  assert.ok(download.suggestedFilename().includes(directId));
  for (const width of [320,1440,390]) {
    await page.setViewportSize({width,height:950});
    await page.waitForFunction(width => {
      const tools=document.querySelector('.registration-receipt-tools'),back=document.querySelector('.registration-receipt-status > .discovery-detail-back');
      const a=tools?.getBoundingClientRect(),b=back?.getBoundingClientRect();
      const available=document.querySelector('.community-shell').getBoundingClientRect().width;
      const expected=Math.min(available,width>760?552:460);
      const actual=document.querySelector('.web-registration--receipt').getBoundingClientRect().width;
      return innerWidth===width&&Math.abs(actual-expected)<1&&a&&b&&a.right<=b.left&&Math.abs(a.top+a.height/2-b.top-b.height/2)<2;
    },width);
    // Read the geometry in one layout snapshot, rather than across resize frames.
    const {row,save,back}=await page.evaluate(() => ({
      row:document.querySelector('.registration-receipt-status').getBoundingClientRect().toJSON(),
      save:document.querySelector('.registration-receipt-tools > button:last-child').getBoundingClientRect().toJSON(),
      back:document.querySelector('.registration-receipt-status > .discovery-detail-back').getBoundingClientRect().toJSON(),
    }));
    assert.ok(save.x+save.width<=back.x && Math.abs(save.y+save.height/2-back.y-back.height/2)<2,'票根操作应同排，返回靠右 '+JSON.stringify({width,save,back,row}));
    assert.ok(row.x+row.width<=width && await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.goto(origin+'/players?event=web-direct');
  await page.getByRole('link',{name:'查看报名',exact:true}).click();
  assert.equal(await ticket(page,'报名成功'),directId);
  await page.reload();await ticket(page,'报名成功');
  await page.locator('.registration-receipt-status').getByRole('link',{name:'返回',exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('event')==='web-direct'&&!new URLSearchParams(location.search).has('view'));
  await page.goto(origin+'/players?view=register&event=web-direct');
  assert.equal(await ticket(page, '报名成功'), directId);
  const records = await request('staff/registrations?event=web-direct', undefined, true);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].answers, { major: '计算机', idea: '做一个真实项目', track: '设计', skills: ['研究'] });
  assert.equal(records[0].source, 'website');
  assert.equal(records[0].phone,'13800000000');
  assert.equal(records[0].wechat,'player_wechat');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  for (const [id, decision, title] of [['web-review', 'approved', '报名成功'], ['web-rejected', 'rejected', '审核未通过']]) {
    await fill(page, id, id === 'web-review' ? '13800000001' : '13800000002');
    await page.getByRole('button', { name: '提交报名', exact: true }).click();
    const receipt = await ticket(page, '等待审核');
    await request('staff/registrations/' + receipt + '/review', { status: decision }, true);
    await page.getByRole('button', { name: '刷新状态', exact: true }).click();
    await ticket(page, title);
  }
  await fill(page,'web-offline','13800000005');
  await page.getByRole('button',{name:'提交报名',exact:true}).click();
  await ticket(page,'报名成功');
  assert.equal(await page.locator('.registration-ticket .registration-event-facts dd').nth(1).innerText(),'线下');
  await page.getByText('线下，福州 · 福州大学旗山校区',{exact:true}).waitFor();
  const second = await context.newPage();
  await Promise.all([fill(page, 'web-race', '13800000003'), fill(second, 'web-race', '13800000003')]);
  await Promise.all([page.getByRole('button', { name: '提交报名', exact: true }).click(), second.getByRole('button', { name: '提交报名', exact: true }).click()]);
  assert.equal(await ticket(page, '报名成功'), await ticket(second, '报名成功'));
  assert.equal((await request('staff/registrations?event=web-race', undefined, true)).length, 1);
  await second.close();
  await page.goto(origin + '/players?view=tickets');
  await page.getByRole('heading', { name: '我的报名', level: 1 }).last().waitFor();
  assert.equal(await page.getByText('本机保存的回执可直接查看。登录后也可查看账号下的报名。',{exact:true}).count(),0);
  assert.equal(await page.getByRole('link',{name:'查看全部活动',exact:true}).count(),0);
  assert.deepEqual(await page.locator('.registration-record-order').allTextContents(),['01','02','03','04','05']);
  const savedCard=page.locator('.registration-record').filter({hasText:'官网报名测试 · web-direct'});
  assert.deepEqual(await savedCard.locator('.registration-event-facts dt').allTextContents(),['活动时间','参与方式','活动地点']);
  await page.getByRole('link').filter({ hasText: '官网报名测试 · web-direct' }).click();
  assert.equal(await ticket(page, '报名成功'), directId);
  await page.locator('.registration-receipt-status').getByRole('link',{name:'返回',exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('view')==='tickets');
  assert.deepEqual(errors, []);

  const accountContext = await browser.newContext({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' });
  const accountPage = await accountContext.newPage();
  await accountPage.goto(origin);
  const login = await accountContext.request.post(origin + '/api/community/login', {
    headers: { 'X-Community-Request': '1' }, data: { email: 'player@example.test', password: 'Player-2026!' },
  });
  assert.ok(login.ok());
  await fill(accountPage, 'web-account', '13800000004');
  await accountPage.getByRole('button', { name: '提交报名', exact: true }).click();
  const accountId = await ticket(accountPage, '报名成功');
  assert.ok(Math.abs((await accountPage.locator('.registration-ticket').boundingBox()).width-552)<1);
  assert.equal(await accountPage.locator('.registration-ticket h2').evaluate(el=>getComputedStyle(el).fontSize),'38.4px');
  const mine = await accountContext.request.get(origin + '/api/community/mine').then(response => response.json());
  assert.ok(mine.registrations.some(row => row.id === accountId));
  await accountPage.evaluate(() => localStorage.clear());
  await accountPage.goto(origin+'/players?view=register&event=web-account');
  assert.equal(await ticket(accountPage,'报名成功'),accountId);
  await accountPage.goto(origin+'/players?event=web-account');
  await accountPage.getByRole('link',{name:'查看报名',exact:true}).click();
  assert.equal(await ticket(accountPage, '报名成功'), accountId);
  assert.ok(await accountPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('通过 官网四类问卷、直报票根、待审核/通过/未通过、丢包恢复、同浏览器多页去重、刷新回看、账号报名与跨本机存储恢复。');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
  await new Promise(done => server.close(done));
  api.close();
  await rm(directory, { recursive: true, force: true });
}
