import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

const origin = new URL(process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173');
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
  throw Error('此测试使用本机运营预览账号，请指定本机预览地址。');
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({
    baseURL: origin.origin,
    viewport: { width: 390, height: 844 },
    timezoneId: 'Africa/Lagos',
  });
  const password =
    process.env.CMS_OWNER_PASSWORD ||
    (await readFile(new URL('../.local/operations/preview-password', import.meta.url), 'utf8')).trim();
  const response = await context.request.post('/cms-api/staff/login', {
    data: { email: process.env.CMS_OWNER_EMAIL || 'operator@01player.test', password },
  });
  assert.ok(response.ok(), '请启动本机运营预览，并使用该预览的账号。');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  // The page and login are real. Intercept all business requests so test submissions never enter the workspace.
  let event = {
    id: 'editor-fixture',
    name: '排练场次',
    status: 'open',
    publicationStatus: 'draft',
    rules: [],
    formFields: [],
    hasAlbum: true,
    draftRevision: 'r1',
  };
  let firstSave,
    simulateLostResponse = true,
    conflict = false;
  let extraEvents = [];
  let project;
  const approvedProjects = [
    { id: 'ordinary-project', name: '普通作品', status: 'approved' },
    { id: 'third-project', name: '第三位作品', status: 'approved', homePinPosition: 3 },
    { id: 'first-project', name: '第一位作品', status: 'approved', homePinPosition: 1 },
  ];
  let eventPins = [null, null, null];
  const photos = new Map([event.id, 'album-b'].map(id => [id, {
    id, eventId: id, title: '照片 ' + id, imageUrl: '/images/club-logo-white.svg', category: 'activity',
  }]));
  await page.route('**/cms-api/media', route => {
    assert.equal(route.request().method(), 'POST');
    assert.match(route.request().headers()['content-type'], /multipart\/form-data; boundary=/);
    const match = route.request().postData().match(/filename="(poster|group-qr|album)\.png"/);
    assert.ok(match);
    const url = match[1] === 'group-qr' ? '/images/join-official-wechat-qr.png' : '/images/club-logo-white.svg';
    return route.fulfill({ status: 201, json: { doc: { url } } });
  });
  await page.route('**/cms-api/desk', async (route) => {
    const request = route.request().postDataJSON();
    if (request.path === 'staff/home-pins/events') {
      if (request.method === 'POST') {
        assert.deepEqual(request.data.expected, eventPins);
        eventPins = request.data.slots;
      }
      return route.fulfill({ json: { slots: eventPins } });
    }
    if (request.method === 'GET') {
      if (request.path === 'staff/projects') return route.fulfill({ json: project ? [project, ...approvedProjects] : approvedProjects });
      if (request.path === 'staff/registrations') {
        assert.equal(request.query.summary, '1');
        const sample = [
          { id: 'review-one', name: '样例玩家甲', eventId: event.id, status: 'pending', phone: '12345678900' },
          { id: 'review-two', name: '样例玩家乙', eventId: event.id, status: 'approved' },
        ];
        const items = sample.filter(row => !request.query.status || row.status === request.query.status);
        return route.fulfill({ json: { items, total: items.length, totalPages: 1, page: 1, statusCounts: { pending: 1, approved: 1 } } });
      }
      if (request.path === 'staff/photos') {
        const key = request.query?.event;
        if (!key || key === event.id) await new Promise((resolve) => setTimeout(resolve, 500));
        return route
          .fulfill({
            json: [...photos.values()].filter(photo => !key || photo.eventId === key),
          })
          .catch(() => {});
      }
      return route.fulfill({
        json:
          request.path === 'staff/events'
            ? [event, { ...event, id: 'album-b', name: '另一个相册', category: 'competition',
                publicationStatus: 'published' }, ...extraEvents].map(row => ({
                  ...row, homePinPosition: eventPins.indexOf(row.id) + 1,
                }))
            : event,
      });
    }
    if (request.path === 'staff/projects') {
      assert.match(request.data.id, /^[0-9a-f-]{36}$/i);
      project = { ...request.data, status: 'pending' };
      return route.fulfill({ json: project });
    }
    if (/^staff\/photos(?:\/[\w-]+)?$/.test(request.path)) {
      const id = request.path.split('/')[2] || 'new-album-photo';
      const photo = { ...photos.get(id), ...request.data, id };
      photos.set(id, photo);
      return route.fulfill({ json: photo });
    }
    if (request.path === 'staff/events') {
      if (simulateLostResponse) {
        simulateLostResponse = false;
        firstSave = request.data;
        return route.abort('connectionreset');
      }
      assert.deepEqual(request.data, firstSave, '重试新建须使用相同 ID 和内容');
      event = { ...event, ...request.data };
    } else if (request.path.endsWith('/publish')) {
      assert.equal(request.data.draftRevision, event.draftRevision);
      return route.fulfill({ status: 400, json: { error: '发布前请填写活动介绍。' } });
    } else if (conflict) {
      conflict = false;
      event = { ...event, name: '另一位运营的新标题', draftRevision: 'r2' };
      return route.fulfill({ status: 409, json: { error: '活动版本已更新。' } });
    } else {
      assert.fail('遇到未预期的写入操作 ' + request.path);
    }
    return route.fulfill({ json: event });
  });
  await page.goto('/admin/operations?tab=events&new=1');
  const name = page.getByLabel('活动名称');
  await name.fill('校内共创日');
  const goBack = page.locator('.op-head').first().getByRole('button', { name: '返回', exact: true });
  await goBack.waitFor();
  assert.equal(await page.getByRole('button', { name: '从素材库选择', exact: true }).count(), 0);
  page.once('dialog', dialog => dialog.dismiss());
  await goBack.click();
  assert.equal(await name.inputValue(), '校内共创日');
  const rowTops = selector => page.locator(selector).evaluateAll(
    fields => [...new Set(fields.map(field => Math.round(field.getBoundingClientRect().top)))],
  );
  assert.equal(await page.locator('.op-event-schedule input').count(), 5);
  assert.equal(await page.locator('.op-registration-controls select').count(), 3);
  const eventPreview = page.getByRole('button', { name: '预览活动', exact: true });
  const saveDraft = page.getByRole('button', { name: '保存草稿', exact: true });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const [previewBox, draftBox] = await Promise.all([eventPreview.boundingBox(), saveDraft.boundingBox()]);
    assert.ok(previewBox.x + previewBox.width < draftBox.x && Math.abs(previewBox.y - draftBox.y) < 1);
  }
  await eventPreview.click();
  await page.locator('.event-preview').getByRole('heading', { name: '校内共创日' }).waitFor();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await name.inputValue(), '校内共创日');
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal((await rowTops('.op-event-sections > section')).length, 1);
    const [schedule, registration, questions] = await page.locator('.op-event-sections > section')
      .evaluateAll(panels => panels.map(panel => panel.getBoundingClientRect().width));
    assert.ok(schedule < registration && schedule < questions);
    assert.ok(registration / (registration + questions) >= 0.39);
    assert.equal((await rowTops('.op-registration-controls select')).length, 1);
    const qr = page.getByRole('group', { name: '票根进群二维码（选填）' });
    const upload = await qr.getByRole('button', { name: '上传二维码', exact: true }).boundingBox();
    assert.ok(Math.abs(upload.width - (await qr.boundingBox()).width) < 2);
    const type = await page.getByRole('combobox', { name: '活动类型', exact: true }).boundingBox();
    const poster = await page.getByRole('textbox', { name: '活动海报', exact: true }).boundingBox();
    assert.ok(poster.x > type.x && Math.abs(poster.y - type.y) < 2);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal((await rowTops('.op-registration-controls select')).length, 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.getByText('活动类型名称', { exact: true }).count(), 0);
  await page.getByLabel('活动标语').fill('把想法做出来');
  await page.getByLabel('活动类型', { exact: true }).selectOption('salon');
  await page.getByLabel('开放作品提交', { exact: true }).check();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上传图片', exact: true }).click();
  await (await chooser).setFiles({
    name: 'poster.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.getByText('海报已上传。').waitFor();
  assert.equal(await page.getByLabel('活动海报', { exact: true }).inputValue(), '/images/club-logo-white.svg');
  const qrChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上传二维码', exact: true }).click();
  await (await qrChooser).setFiles({
    name: 'group-qr.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.getByText('二维码已上传。').waitFor();
  await page.getByLabel('开始时间', { exact: true }).fill('2026-12-05T14:30');
  await page.getByLabel('参与规则（每行一条）').fill('提前到场\n');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: '报名审核', exact: true }).click();
  assert.equal(await name.inputValue(), '校内共创日');
  const publish = page.getByRole('button', { name: '发布活动' });
  assert.equal(await publish.getAttribute('class'), await page.getByRole('button', { name: '保存草稿' }).getAttribute('class'));
  await publish.click();
  await page.getByRole('alert').filter({hasText:'连接中断'}).waitFor();
  await publish.click();
  await page.getByRole('alert').filter({ hasText: '草稿已保存，发布未完成' }).waitFor();
  assert.deepEqual(firstSave.rules, ['提前到场']);
  assert.equal(firstSave.startsAt, '2026-12-05T06:30:00.000Z');
  assert.equal(firstSave.category, 'salon');
  assert.equal(firstSave.type, '沙龙');
  assert.equal(firstSave.subtitle, '把想法做出来');
  assert.equal(firstSave.coverUrl, '/images/club-logo-white.svg');
  assert.equal(firstSave.ticketGroupQrUrl, '/images/join-official-wechat-qr.png');
  assert.equal(firstSave.submissionsOpen, true);
  assert.equal(new URL(page.url()).searchParams.get('edit'), event.id);
  await page.reload();
  await page.getByRole('heading', { name: '编辑活动' }).waitFor();
  assert.equal(await name.inputValue(), '校内共创日');
  conflict = true;
  await name.fill('本机编辑');
  await page.getByRole('button', { name: '保存草稿' }).click();
  const latest = page.getByRole('button', { name: '载入最新版本' });
  await latest.waitFor();
  assert.equal(await name.inputValue(), '本机编辑');
  page.once('dialog', (dialog) => dialog.accept());
  await latest.click();
  await page.getByText('已载入最新版本。').waitFor();
  assert.equal(await name.inputValue(), '另一位运营的新标题');
  await page.getByRole('button', { name: '展开导航' }).click();
  const navigation = page.getByRole('group', { name: '社区运营' });
  assert.deepEqual((await navigation.getByRole('link').allTextContents()).map(label => label.trim()),
    ['玩家计划', '共创广场', '零一运维', '玩家管理', '零一时光机', '零一科研与竞赛', '地球生存攻略']);
  await page.getByRole('link', { name: '零一时光机', exact: true }).click();
  const albumCategories = page.getByRole('group', { name: '相册分类' });
  assert.deepEqual(await albumCategories.getByRole('button').allTextContents(), ['全部', '赛事', '沙龙', '合作', '团建']);
  assert.equal(await albumCategories.getByRole('button', { name: '全部' }).getAttribute('aria-pressed'), 'true');
  const historicalPhoto = page.locator('.op-album-archive-photo').first();
  const caption = page.getByLabel('照片说明');
  const credit = page.getByLabel('摄影署名');
  const cancelPhoto = page.getByRole('button', { name: '取消', exact: true });
  const savePhoto = page.getByRole('button', { name: '保存照片', exact: true });
  const historicalCaption = await historicalPhoto.locator('strong').textContent();
  await historicalPhoto.click();
  assert.equal(await caption.inputValue(), historicalCaption);
  await page.getByAltText('所选图片').waitFor();
  await caption.fill('历史照片的新说明');
  await savePhoto.click();
  await page.getByRole('button', { name: /历史照片的新说明/ }).click();
  assert.equal(await caption.inputValue(), '历史照片的新说明');
  await cancelPhoto.click();
  await albumCategories.getByRole('button', { name: '赛事' }).click();
  await page.getByLabel('选择活动', { exact: true }).selectOption('album-b');
  await page.getByText('照片 album-b').waitFor();
  const albumActions = page.locator('.op-album-actions');
  await albumActions.getByRole('button', { name: '刷新', exact: true }).waitFor();
  await albumActions.getByRole('button', { name: '添加照片', exact: true }).click();
  assert.equal(await page.getByLabel('所属活动').inputValue(), 'album-b');
  const photoForm = page.locator('.op-photo-form');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await photoForm.evaluate(form => {
      const bounds = form.getBoundingClientRect();
      const buttons = [...form.querySelectorAll('.op-photo-actions > button')].map(button => button.getBoundingClientRect());
      return { width: bounds.width, fits: buttons.every(button => button.right <= bounds.right),
        oneRow: buttons.length === 3 && buttons.every(button => button.top === buttons[0].top) };
    });
    assert.ok(layout.fits && layout.oneRow, '照片按钮应在同一行且位于表单内');
    if (width === 1440) assert.ok(layout.width <= 680, '桌面照片表单应有最大宽度');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await caption.fill('新上传的相册照片');
  await photoForm.getByLabel('上传图片', { exact: true }).setInputFiles({
    name: 'album.png', mimeType: 'image/png', buffer: Buffer.from('test album photo'),
  });
  await page.getByAltText('所选图片').waitFor();
  await savePhoto.click();
  await page.getByRole('button', { name: /新上传的相册照片/ }).click();
  assert.equal(await caption.inputValue(), '新上传的相册照片');
  await credit.fill('更新摄影署名');
  await savePhoto.click();
  await page.getByRole('button', { name: /新上传的相册照片/ }).click();
  assert.equal(await credit.inputValue(), '更新摄影署名');
  await cancelPhoto.click();
  await albumCategories.getByRole('button',{name:'团建',exact:true}).click();
  await albumActions.getByRole('button',{name:'添加照片',exact:true}).click();
  assert.equal(await page.getByLabel('照片用途',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'从素材库选择图片',exact:true}).count(),0);
  await page.getByRole('button',{name:'上传图片',exact:true}).waitFor();
  await page.getByLabel('所属活动').selectOption('album-b');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.waitForTimeout(600);
  assert.equal(await page.getByText('照片 ' + event.id).count(), 0);
  extraEvents = Array.from({ length: 60 }, (_, index) => ({
    id: 'perf-' + index, name: '测试活动 ' + index, publicationStatus: 'published',
  }));
  await page.goto('/admin/operations?tab=events');
  await page.getByText('共 62 场活动').waitFor();
  const eventActions = await page.locator('.op-pin-title-actions').getByRole('button').allTextContents();
  assert.equal(eventActions[0].trim(), '设置置顶');
  assert.match(eventActions[1], /新建玩家计划/);
  assert.deepEqual(new Set(await page.locator('.op-event-category').allTextContents()), new Set(['赛事', '沙龙', '合作']));
  await page.getByRole('button', { name: '设置置顶', exact: true }).click();
  await page.getByRole('combobox', { name: '置顶第 1 位', exact: true }).selectOption('perf-59');
  await page.getByRole('combobox', { name: '置顶第 2 位', exact: true }).selectOption('perf-30');
  const thirdSlot = page.getByRole('combobox', { name: '置顶第 3 位', exact: true });
  await thirdSlot.selectOption('album-b');
  await page.getByRole('button', { name: '保存置顶设置' }).click();
  await page.locator('.op-event-row').filter({ hasText: '另一个相册' }).getByText('置顶第 3 位', { exact: true }).waitFor();
  assert.deepEqual((await page.locator('.op-event-row .op-row-title').allTextContents()).slice(0, 5),
    ['测试活动 59', '测试活动 30', '另一个相册', '另一位运营的新标题', '测试活动 0']);
  await page.getByRole('button', { name: '设置置顶', exact: true }).click();
  const categories = page.getByRole('group', { name: '活动类型' });
  assert.deepEqual(await categories.getByRole('button').allTextContents(), ['全部', '赛事', '沙龙', '合作']);
  assert.equal(await categories.getByRole('button', { name: '全部' }).getAttribute('aria-pressed'), 'true');
  await categories.getByRole('button', { name: '沙龙' }).click();
  await page.getByText('共 1 场活动').waitFor();
  await categories.getByRole('button', { name: '全部' }).click();
  await page.getByText('共 62 场活动').waitFor();
  assert.equal(await page.locator('.op-event-row').count(), 20);
  assert.equal(await page.locator('.op-event-row .specular-button__fx, .op-event-row canvas').count(), 0);
  const rowAction = page.locator('.op-event-row .op-action').first();
  const shine = () => rowAction.evaluate((button) => getComputedStyle(button, '::before').content);
  await page.mouse.move(0, 0);
  assert.equal(await shine(), 'none');
  await rowAction.hover();
  assert.equal(await shine(), '""');
  const paging = page.getByRole('navigation', { name: '活动列表分页' });
  await paging.getByRole('button', { name: '下一页' }).click();
  await paging.getByText('第 2 页 / 共 4 页').waitFor();
  await page.locator('.op-filters select').selectOption('published');
  await paging.getByText('第 1 页 / 共 4 页').waitFor();
  await page.getByText('共 61 场活动').waitFor();
  await page.getByRole('link', { name: '报名审核', exact: true }).click();
  const filterGroup = page.getByRole('group', { name: '审核状态' });
  await filterGroup.getByRole('button', { name: '待审核 1' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'registrations');
  await page.locator('.op-review-card summary').filter({ hasText: '样例玩家甲' }).click();
  await page.getByText('12345678900', { exact: true }).waitFor();
  const grid = page.locator('.op-review-grid');
  const columns = () => grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(), 1);
  await page.setViewportSize({ width: 1440, height: 844 });
  assert.ok(await columns() > 1);
  await filterGroup.getByRole('button', { name: '待审核 1' }).click();
  await page.getByText('共 1 条记录').waitFor({ state: 'attached' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.locator('.template-default--nav-hydrated').waitFor({ state: 'attached' });
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const newActions = page.getByRole('navigation', { name: '新建内容' });
  assert.deepEqual((await newActions.getByRole('link').allTextContents()).map(value => value.trim()),
    ['新建玩家计划', '新建共创广场']);
  assert.equal(await page.getByText('待发布活动', { exact: true }).count(), 0);
  await newActions.getByRole('link', { name: '新建共创广场' }).click();
  await page.getByRole('heading', { name: '新建共创广场', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
  const projectFormBack = page.locator('.op-project-editor > .op-head').getByRole('button', { name: '返回', exact: true });
  await projectFormBack.click();
  await page.getByRole('heading', { name: '作品审核', exact: true }).waitFor();
  const projectActions = await page.locator('.op-pin-title-actions').getByRole('button').allTextContents();
  assert.equal(projectActions[0].trim(), '设置置顶');
  assert.match(projectActions[1], /新建共创广场/);
  await page.getByRole('button', { name: '新建共创广场' }).click();
  await page.getByLabel('项目名称').fill('共创广场预览作品');
  await page.getByLabel('公开署名').fill('测试创作团队');
  await page.getByLabel('项目简介').fill('验证后台录入作品');
  await page.getByLabel('项目介绍').fill('这是浏览器回归中的作品介绍。');
  await page.getByLabel('项目链接（选填）').fill('https://example.test/work');
  const projectImage=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=160;const x=c.getContext('2d');x.fillStyle='#555';x.fillRect(0,0,160,160);return c.toDataURL('image/png').split(',')[1];});
  for(const label of ['卡片封面','项目横幅']) {
    await page.getByLabel(label,{exact:true}).setInputFiles({name:'project.png',mimeType:'image/png',buffer:Buffer.from(projectImage,'base64')});
    await page.getByAltText(label+'预览',{exact:true}).waitFor();
  }

  await page.getByRole('button', { name: '提交审核' }).click();
  await page.getByText('作品已提交审核。').waitFor();
  await page.getByText('共创广场预览作品', { exact: true }).waitFor();
  assert.equal(project.author, '测试创作团队');
  const sources = page.getByRole('group', { name: '投稿来源' });
  await sources.getByRole('button', { name: '零一赛事' }).click();
  await page.getByText('当前没有待审核的记录。').waitFor();
  await sources.getByRole('button', { name: '自主投稿' }).click();
  const projectCard = page.locator('.op-review-card').filter({ hasText: project.name });
  await projectCard.locator('summary').click();
  await projectCard.getByRole('link', { name: /测试创作团队/ }).waitFor();
  assert.equal(await projectCard.getByText('查看作者账号').count(), 0);
  await page.getByRole('group', { name: '审核状态' }).getByRole('button', { name: '全部 4' }).click();
  assert.deepEqual(await page.locator('.op-review-card .op-row-title').allTextContents(),
    ['第一位作品', '第三位作品', '共创广场预览作品', '普通作品']);
  const expand = page.getByRole('button', { name: '展开导航' });
  if (await expand.isVisible()) await expand.click();
  const toggleEnglish = page.getByRole('button', { name: '切换到英文' });
  assert.equal(await toggleEnglish.textContent(), '中');
  const languageTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  await toggleEnglish.click();
  await page.getByRole('heading', { name: 'Project Review', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Switch to Chinese' }).textContent(), 'EN');
  assert.equal(await page.evaluate(() => performance.timeOrigin), languageTimeOrigin);
  await page.getByText('共创广场预览作品', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Project Review', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('通过：编辑离开保护、断网重试、部分发布失败、恢复草稿、时区、多人修改冲突和相册切换。');
} finally {
  await browser.close();
}
