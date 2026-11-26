import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import native from '../../07-玩家计划小程序/tests/support/native-fixture.cjs';

// Native page controllers use a temporary wx storage/navigation host. Every HTTP
// request is processed by the real community service, without a player session.
function connectMini(site) {
  const wx = native.nativeFixture();
  globalThis.getCurrentPages = () => [];
  wx.request = async ({ url, method, header, data, success, fail }) => {
    try {
      const { pathname, search } = new URL(url);
      assert.ok(pathname.startsWith('/api/community/'));
      const response = await fetch(new URL(pathname + search, site), {
        method, headers: header, body: data && JSON.stringify(data),
        signal: AbortSignal.timeout(10000),
      });
      success({ statusCode: response.status, data: await response.json() });
    } catch (error) {
      fail(error);
    }
  };
  return wx;
}

// Run only in the disposable operations integration instance.
async function verifyRosterPages(staff, site, eventId, questionId) {
  for (let i = 1; i <= 21; i++) {
    const response = await fetch(new URL('/api/community/events/' + eventId + '/registrations', site), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '分页验收玩家' + i, contact: 'roster-' + i + '@example.test',
        idempotencyKey: randomUUID(), answers: { [questionId]: '参加现场活动' },
      }),
    });
    assert.equal(response.status, 200);
    await response.body.cancel();
  }
  const roster = staff.locator('.op-list details');
  const status = staff.getByRole('combobox', { name: '审核状态', exact: true });
  await status.selectOption('pending');
  await staff.getByText('共 21 条记录', { exact: true }).waitFor();
  assert.equal(await roster.count(), 20);
  const pager = staff.getByRole('navigation', { name: '报名名单分页' });
  const next = pager.getByRole('button', { name: '下一页' });
  await next.focus();
  await staff.keyboard.press('Enter');
  await pager.getByText('第 2 页 / 共 2 页').waitFor();
  assert.equal(await roster.count(), 1);
  assert.equal(new URL(staff.url()).searchParams.get('page'), '2');
  await staff.setViewportSize({ width: 390, height: 844 });
  await staff.reload();
  await pager.getByText('第 2 页 / 共 2 页').waitFor();
  await roster.locator('summary').click();
  await roster.getByRole('button', { name: '通过', exact: true }).click();
  await staff.getByText('共 20 条记录', { exact: true }).waitFor();
  assert.equal(await roster.count(), 20);
  assert.equal(await pager.count(), 0);
  assert.equal(new URL(staff.url()).searchParams.has('page'), false);
  assert.equal(await status.inputValue(), 'pending');
  assert.equal(await staff.getByRole('combobox', { name: '场次', exact: true }).inputValue(), eventId);
  await status.selectOption('rejected');
  await staff.getByText('当前没有符合条件的记录。', { exact: false }).waitFor();
  assert.equal(await roster.count(), 0);
  const interruptRosterRead = route => {
    const { path, query } = route.request().postDataJSON();
    if (path === 'staff/registrations' && query?.status === 'approved')
      return route.fulfill({ status: 503, json: { error: '暂时无法读取报名名单。' } });
    return route.continue();
  };
  await staff.route('**/cms-api/desk', interruptRosterRead);
  await status.selectOption('approved');
  await staff.getByRole('alert').filter({ hasText: '暂时无法读取报名名单。' }).waitFor();
  await staff.unroute('**/cms-api/desk', interruptRosterRead);
  await staff.getByRole('button', { name: '刷新', exact: true }).click();
  await staff.getByText('共 2 条记录', { exact: true }).waitFor();
  assert.equal(await roster.count(), 2);
  assert.ok(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('通过：报名名单按场次及状态分页、键盘翻页、手机刷新回到原页与审核后自动退回上一页。');
}

export async function verifyMiniRegistration({ admin, site, email, password }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const title = '周末同场报名验收', applicant = '匿名报名验收玩家';
  try {
    const staff = await browser.newPage({ baseURL: admin });
    await staff.goto('/admin/login');
    await staff.locator('input[type=email]').fill(email);
    await staff.locator('input[type=password]').fill(password);
    await staff.locator('form button[type=submit]').click();
    await staff.waitForURL((url) => url.pathname === '/admin' || url.pathname === '/admin/');
    await staff.goto('/admin/operations?tab=events&new=1');
    await staff.getByLabel('活动名称').fill(title);
    await staff.getByLabel('活动介绍', { exact: true }).fill('三端联测，本场通过运营审核确认报名。');
    await staff.getByLabel('对外展示日期').fill((new Date().getUTCFullYear() + 1) + '.06.01');
    await staff.getByLabel('报名方式').selectOption('review');
    await staff.getByRole('button', { name: /添加问题/ }).click();
    await staff.getByLabel('题目', { exact: true }).fill('希望体验什么？');
    await staff.getByLabel('必填', { exact: true }).check();
    await staff.getByRole('button', { name: '发布活动' }).click();
    await staff.getByText('已发布到官网与小程序。', { exact: true }).waitFor();
    const id = new URL(staff.url()).searchParams.get('edit');
    assert.ok(id);
    await staff.goto('/admin/operations?tab=events');
    const pin = staff.getByRole('button', { name: title + '，小程序首页置顶', exact: true });
    await pin.click();
    await staff.getByRole('button', { name: title + '，小程序首页置顶', pressed: true }).waitFor();
    const pinnedEvent = await (await fetch(new URL('/api/community/events/' + id, site))).json();
    assert.equal(pinnedEvent.miniHomePinned, true);
    await pin.click();
    await staff.getByRole('button', { name: title + '，小程序首页置顶', pressed: false }).waitFor();

    const visitor = await browser.newPage({ baseURL: site });
    await visitor.goto('/players?event=' + encodeURIComponent(id));
    await visitor.getByRole('heading', { name: title, exact: true }).waitFor();
    const wx = connectMini(site);
    const detail = native.page('event');
    detail.onLoad({ id });
    try {
      await detail.onShow();
      assert.equal(detail.data.event?.name, title, detail.data.error);
      detail.openRegistration();
      assert.equal(wx.navigatedTo, '/pages/registration/index?id=' + id);
    } finally {
      detail.onUnload();
    }
    const registration = native.page('registration');
    await registration.onLoad({ id });
    const input = (field, value) => registration.input({ currentTarget: { dataset: { field } }, detail: { value } });
    input('name', applicant);
    input('contact', 'anonymous@example.test');
    await registration.submit();
    const [question] = registration.data.fields;
    assert.equal(registration.data.invalidField, 'answer-' + question.id);
    registration.answer({ currentTarget: { dataset: { id: question.id } }, detail: { value: '上手做一个作品' } });
    await registration.submit();
    assert.equal(registration.data.formError, '');
    const receiptLocation = new URL(wx.redirect, site);
    assert.equal(receiptLocation.pathname, '/pages/receipt/index');
    const receiptId = receiptLocation.searchParams.get('id');
    assert.ok(receiptId);
    const receipt = native.page('receipt');
    receipt.onLoad({ id: receiptId });
    await receipt.onShow();
    assert.equal(receipt.data.receipt.title, '等待审核');

    await staff.goto('/admin/operations?tab=registrations&event=' + encodeURIComponent(id));
    const row = staff.locator('details').filter({ has: staff.getByText(applicant, { exact: true }) });
    await row.locator('summary').click();
    await row.getByText('anonymous@example.test', { exact: true }).waitFor();
    await row.getByText('希望体验什么？', { exact: true }).waitFor();
    assert.match(await row.innerText(), /上手做一个作品/);
    await row.getByRole('button', { name: '通过', exact: true }).click();
    await row.locator('summary').getByText('已通过', { exact: true }).waitFor();
    await receipt.onPullDownRefresh();
    assert.equal(receipt.data.error, '');
    assert.equal(receipt.data.receipt.title, '报名成功');
    assert.equal(receipt.data.receipt.id, receiptId);
    assert.equal(receipt.data.receipt.receiptToken, undefined);
    await verifyRosterPages(staff, site, id, question.id);
    console.log('通过：浏览器登录与发活动、官网展示、小程序原生页面免登录报名、后台审核、回执更新。');
  } finally {
    await browser.close();
    delete globalThis.wx;
    delete globalThis.Page;
    delete globalThis.getCurrentPages;
  }
}
