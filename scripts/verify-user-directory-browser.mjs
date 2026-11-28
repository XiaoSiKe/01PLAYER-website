import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Called from the isolated operations integration run with disposable staff and player accounts.
export async function verifyUserDirectory({ admin, site, owner, operator, email, password, id }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const guest = await browser.newPage({ baseURL: admin });
    await guest.goto('/admin/community-users?user=' + encodeURIComponent(id));
    await guest.waitForURL((url) => url.pathname === '/admin/login');
    assert.equal(new URL(guest.url()).searchParams.get('redirect'), '/admin/community-users?user=' + id);
    await guest.close();
    for (const [role, jwt, width] of [
      ['operator', operator, 390],
      ['owner', owner, 1280],
    ]) {
      const context = await browser.newContext({ baseURL: admin, viewport: { width, height: 844 } });
      await context.addCookies([
        { name: 'payload-token', value: jwt, url: admin, httpOnly: true, sameSite: 'Lax' },
      ]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/admin/community-users');
      await page.getByRole('heading', { name: '玩家管理' }).waitFor();
      const identities = page.getByRole('combobox', { name: '身份', exact: true });
      assert.deepEqual(await identities.locator('option').allTextContents(),
        ['全部身份', '头号玩家', '先锋玩家', '零一玩家']);
      await identities.selectOption('pioneer');
      await page.getByText('共 1 个账号', { exact: true }).waitFor();
      assert.ok((await page.locator('.cu-role').allTextContents()).every(identity => identity === '先锋玩家'));
      await identities.selectOption('all');
      if (role === 'owner') {
        const administratorEmail = 'directory-' + crypto.randomUUID() + '@example.test';
        const initialPassword = crypto.randomUUID();
        const updatedPassword = crypto.randomUUID();
        await page.getByRole('link', { name: '新增零一账号' }).click();
        await page.getByLabel('邮箱').fill(administratorEmail);
        await page.getByLabel('密码', { exact: false }).fill(initialPassword);
        const staffIdentity = page.getByRole('combobox', { name: '运营身份' });
        assert.equal(await staffIdentity.inputValue(), 'operator');
        await staffIdentity.selectOption('owner');
        await page.getByRole('button', { name: '创建零一账号' }).click();
        await page.getByRole('heading', { name: administratorEmail }).waitFor();
        await page.getByText('头号玩家', { exact: true }).waitFor();
        await page.getByLabel('新密码（可选）').fill(updatedPassword);
        await page.getByRole('button', { name: '保存账号' }).click();
        await page.getByText('运营账号已更新。').waitFor();
        const login = await fetch(admin + '/cms-api/staff/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: administratorEmail, password: updatedPassword }),
        });
        assert.equal(login.status, 200);
        await login.body?.cancel();
        await page.locator('.op-head').first().getByRole('link', { name: '返回', exact: true }).click();
      } else {
        assert.equal(await page.getByRole('link', { name: '新增零一账号' }).count(), 0);
      }
      await page.getByLabel('搜索账号').fill(email);
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await page.getByText('共 1 个账号').waitFor();
      await page.getByRole('link', { name: new RegExp('官网联调玩家') }).click();
      await page.getByRole('heading', { name: '官网联调玩家' }).waitFor();
      const activity = page.getByRole('group', { name: '玩家记录分类' });
      await page.getByRole('region', { name: '报名记录' }).getByRole('link', { name: '账号联调活动' }).waitFor();
      for (const label of ['发布项目', '收藏', '喜欢']) {
        await activity.getByRole('button', { name: label + ' 1' }).click();
        await page.getByRole('region', { name: label }).getByRole('link', { name: '账号关联作品' }).waitFor();
      }
      await page.getByRole('heading', { name: '最近管理记录' }).waitFor();
      await page.getByText(/撤销了所有登录会话/).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const disable = page.getByRole('button', { name: '停用账号', exact: true });
      if (role === 'operator') {
        assert.equal(await disable.count(), 0);
      } else {
        const player = await browser.newPage({ baseURL: site, viewport: { width: 390, height: 844 } });
        await player.goto('/plaza?view=account');
        await player.locator('input[name="email"]').fill(email);
        await player.locator('input[name="password"]').fill(password);
        await player.getByRole('button', { name: '欢迎加入地球Online：零一玩家' }).click();
        await player.getByRole('heading', { name: '玩家空间', exact: true }).waitFor();
        await player.getByRole('complementary', { name: '玩家信息' }).getByText('零一玩家', { exact: true }).waitFor();
        const session = await player.request.get('/api/community/session');
        assert.equal((await session.json()).user.email, email);
        await disable.click();
        await page.getByRole('button', { name: '取消', exact: true }).click();
        await disable.click();
        await page.getByRole('button', { name: '确认停用账号' }).click();
        await page.getByText('账号已停用，所有设备均已退出。').waitFor();
        await player.reload();
        await player.locator('input[name="password"]').waitFor();
        assert.equal(await player.getByText(email, { exact: true }).count(), 0);
        await page.getByRole('button', { name: '恢复账号', exact: true }).click();
        await page.getByRole('button', { name: '确认恢复账号' }).click();
        await page.getByText('账号已恢复，玩家现在可以重新登录。').waitFor();
        await player.reload();
        await player.locator('input[name="password"]').waitFor();
        await player.locator('input[name="email"]').fill(email);
        await player.locator('input[name="password"]').fill(password);
        await player.getByRole('button', { name: '欢迎加入地球Online：零一玩家' }).click();
        await player.getByRole('heading', { name: '玩家空间', exact: true }).waitFor();
        // Another owner session acts using the current record while this detail view stays open.
        const request = { headers: { 'x-01-desk': '1' } };
        const latest = await context.request.post('/cms-api/desk', {
          ...request,
          data: { path: 'staff/users/' + id, method: 'GET' },
        });
        assert.ok(latest.ok());
        const concurrent = await context.request.post('/cms-api/desk', {
          ...request,
          data: {
            path: 'staff/users/' + id + '/revoke-sessions',
            method: 'POST',
            data: { expectedRevision: (await latest.json()).accountRevision },
          },
        });
        assert.ok(concurrent.ok());
        await disable.click();
        await page.getByRole('button', { name: '确认停用账号' }).click();
        await page.getByRole('button', { name: '读取最新资料' }).click();
        await page.getByRole('button', { name: '停用账号', exact: true }).waitFor();
        await player.close();
      }
      await page.locator('.op-head').first().getByRole('link', { name: '返回', exact: true }).click();
      await page.getByText('共 1 个账号').waitFor();
      assert.equal(await page.getByLabel('搜索账号').inputValue(), email);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('通过：后台访客登录回跳、运营只读、负责人停用恢复、手机布局与返回筛选。');
  } finally {
    await browser.close();
  }
}
