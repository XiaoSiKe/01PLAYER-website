import { pageFromPath } from '../src/data/page-paths.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommunityApi } from '../server/community-api.mjs';
import { createPasswordQueue, runPasswordWork } from '../server/community-passwords.mjs';
import { clientAddress } from '../server/community-rate-limits.mjs';
import { pioneerRoster, memberPageLink } from '../src/data/people-navigation.js';
import { events } from '../server/community-seed.mjs';
import { leadership } from '../src/data/leadership.js';
import { matchesFilter } from '../cms/src/ops/workflow.mjs';
import { featuredInSlots } from '../src/community/featured.js';
import { historicalArchivePhotos } from '../src/time-machine/photos.js';

// The demo calendar deliberately contains November and December 2026 activities.
test.beforeEach(t => t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-22T12:00:00Z') }));

function fixtureServer(community) {
  const server = createServer(community);
  server.once('close', community.close);
  return server;
}

function signal() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, catalog) {
  const directory = mkdtempSync(join(tmpdir(),'lingyi-community-test-'));
  const dataFile = join(directory,'data.json');
  const eventsFile = catalog ? join(directory, 'events.json') : undefined;
  if (catalog) writeFileSync(eventsFile, JSON.stringify(catalog));
  const server = fixtureServer(createCommunityApi({ dataFile, demo: true, eventsFile }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{ await new Promise(resolve=>server.close(resolve)); rmSync(directory,{recursive:true,force:true}); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (path, body, expected = 200) => {
      const response = await fetch(`${origin}/api/community/${path}`, { headers: { Cookie:cookie, Origin:origin, 'X-Community-Request':'1', 'Content-Type':'application/json' }, ...(body !== undefined ? { method:'POST', body:JSON.stringify(body) } : {}) });
      if(response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
      const data=await response.json(); assert.equal(response.status,expected,JSON.stringify(data)); return data;
    };
  }
  return { client, dataFile, origin };
}
const playerLogin = {email:'player@example.test',password:'Player-2026!'};
const adminLogin = {email:'admin@example.test',password:'Admin-2026!'};
const recruitment = {roles:'前端开发伙伴',work:'一起开发可用原型',requirements:'每周参与讨论',contact:'demo@example.test'};
const submission = {name:'自主验收项目',summary:'端到端验证提交和审核',description:'一个用于验证公开流程的原创示例项目。',demoUrl:'https://example.com/demo',imageUrl:'https://example.test/card.jpg',bannerUrl:'https://example.test/banner.jpg',recruitment};

test('玩家资料只由登录本人修改，校验头像且旧会话能读取已保存资料', async t => {
  const { client, dataFile } = await fixture(t);
  const visitor = client(), player = client(), admin = client();
  await visitor('account/profile', { name: '未授权', university: '' }, 401);
  const original = (await player('login', playerLogin)).user;
  const update = { name: '新昵称 ', university: ' 测试大学 ', id: 'admin', role: 'admin' };
  const { user } = await player('account/profile', update);
  assert.equal(user.id, original.id);
  assert.equal(user.role, 'player');
  assert.equal(user.name, '新昵称');
  assert.equal(user.university, '测试大学');
  await player('account/profile', { ...update, avatar: 'data:image/svg+xml;base64,PHN2Zy8+' }, 400);
  await player('account/profile', { ...update, avatar: 'data:image/jpeg;base64,/9j/2Q==' }, 400);
  assert.deepEqual((await player('session')).user, user);
  assert.equal((await admin('login', adminLogin)).user.name, '示例管理员');
  assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).users.find(account => account.id === user.id).university, '测试大学');
  assert.equal((await player('account/profile', { name: '新昵称', university: '', avatar: '' })).user.university, undefined);
});

test('路径 1：进行中活动、公开招募、登录后发布关联招募；拒绝错配和过期活动',async t=>{
 const {client}=await fixture(t), visitor=client(), player=client();
 assert.equal((await visitor('events')).find(e=>e.id==='ai-build-sprint').status,'active');
 assert.ok((await visitor('recruitments?event=ai-build-sprint')).some(r=>r.projectId==='campus-agent'));
 const body={eventId:'ai-build-sprint',projectId:'campus-agent',title:'新的组队招募',description:'制作 AI 助手',recruitment};
 await visitor('recruitments',body,401); await player('login',playerLogin);
 const result=await player('recruitments',body); assert.equal(result.eventId,'ai-build-sprint'); assert.equal(result.ownerId,'demo-player');
 assert.ok((await visitor('recruitments?event=ai-build-sprint')).some(r=>r.id===result.id));
 await player('recruitments',{...body,eventId:'autumn-hack'},409);
 await player('recruitments',{...body,projectId:'study-map'},403);
 await player('recruitments',{...body,recruitment:null},400);
});
test('路径 2：已结束活动和广场打开同一个已审核项目，来源可以回到活动',async t=>{
 const {client}=await fixture(t), visitor=client();
 assert.equal((await visitor('events')).find(e=>e.id==='autumn-hack').status,'ended');
 const gallery=await visitor('projects'); const work=gallery.find(p=>p.eventId==='autumn-hack');
 const detail=await visitor(`projects/${work.id}`); assert.equal(detail.id,work.id); assert.equal(detail.eventId,'autumn-hack'); assert.equal(detail.status,'approved');
});
test('路径 3：自主投稿待审核隔离、管理员审核、访客可见、登录用户点赞收藏及重启持久化',async t=>{
 const {client,dataFile}=await fixture(t), player=client(), admin=client(), visitor=client();
 await player('login',playerLogin); const project=await player('projects',submission); assert.equal(project.status,'pending'); assert.equal(project.eventId,null);
 assert.ok(!(await visitor('projects')).some(p=>p.id===project.id)); await visitor(`projects/${project.id}`,undefined,404);
 await player(`review/${project.id}`,{status:'approved'},403); await admin('login',adminLogin);
 assert.ok((await admin('review')).some(p=>p.id===project.id)); await admin(`review/${project.id}`,{status:'approved'});
 assert.ok((await visitor('projects')).some(p=>p.id===project.id));
 await visitor(`reaction/${project.id}`,{kind:'like',active:true},401);
 assert.equal((await player(`reaction/${project.id}`,{kind:'like',active:true})).likes,1);
 assert.equal((await player(`reaction/${project.id}`,{kind:'like',active:true})).likes,1);
 assert.equal((await player(`reaction/${project.id}`,{kind:'save',active:true})).saved,true);
 assert.equal((await visitor(`projects/${project.id}`)).saved,false);
 const restart=fixtureServer(createCommunityApi({dataFile,demo:true})); await new Promise(r=>restart.listen(0,'127.0.0.1',r));
 const saved=await fetch(`http://127.0.0.1:${restart.address().port}/api/community/projects/${project.id}`).then(r=>r.json());
 assert.equal(saved.likes,1); assert.equal(saved.status,'approved'); await new Promise(r=>restart.close(r));
 assert.equal((await player(`reaction/${project.id}`,{kind:'like',active:false})).likes,0);
});
test('退回原因、作者修改重新审核、活动投稿关联、关闭提交校验',async t=>{
 const {client}=await fixture(t), player=client(), admin=client(), visitor=client(); await player('login',playerLogin);await admin('login',adminLogin);
 const project=await player('projects',{...submission,eventId:'ai-build-sprint',externalSource:'forged source'}); assert.equal(project.externalSource,'');
 await admin(`review/${project.id}`,{status:'returned',note:''},400);
 await admin(`review/${project.id}`,{status:'returned',note:'补充演示说明'});
 assert.equal((await player('mine')).projects.find(p=>p.id===project.id).reviewNote,'补充演示说明');
 const edited=await player(`edit/${project.id}`,{...submission,name:'修改后的作品',eventId:'autumn-hack'}); assert.equal(edited.eventId,'ai-build-sprint'); assert.equal(edited.status,'pending');
 await admin(`review/${project.id}`,{status:'approved'}); assert.equal((await visitor(`projects/${project.id}`)).name,'修改后的作品');
 await admin(`review/${project.id}`,{status:'approved'},409);
 await player('projects',{...submission,eventId:'autumn-hack'},409);
 await player('projects',{...submission,eventId:'weekend-lab'},409);
 await player('projects',{...submission,demoUrl:'javascript:alert(1)'},400);
 await player('projects',{...submission,imageUrl:'',bannerUrl:'',demoUrl:''},400);
});
test('报名唯一、联系方式私密；注册不能提权，退出后失去权限；拒绝跨站写入',async t=>{
 const {client,origin,dataFile}=await fixture(t), player=client(), admin=client(), visitor=client();
 await player('register',{email:'new@example.test',password:'A-strong-password',name:'新玩家',role:'admin'});
 assert.equal((await player('session')).user.role,'player');
 await player('review',undefined,403);
 const registration={eventId:'weekend-lab',name:'新玩家',contact:'private@example.test',note:'体验活动'};
 await player('register-event',registration); await player('register-event',registration,409);
 await visitor('registrations',undefined,401); await player('registrations',undefined,403);
 await admin('login',adminLogin); assert.equal((await admin('registrations'))[0].contact,registration.contact);
 assert.ok(!JSON.stringify(await visitor('events')).includes(registration.contact));
 const response=await fetch(`${origin}/api/community/logout`,{method:'POST',headers:{Origin:'https://evil.example','X-Community-Request':'1'}});assert.equal(response.status,403);
 await player('logout',{}); await player('mine',undefined,401);
 assert.ok(!readFileSync(dataFile,'utf8').includes('A-strong-password'));
});
test('先锋玩家与头号玩家按稳定 ID 去重，现有成员链接进入正确人物页',()=>{
 assert.equal(pageFromPath('/team'), 'leadership');
 assert.equal(pioneerRoster.filter(p=>leadership.some(l=>l.id===p.id)).length,0);
 for(const p of leadership) assert.equal(memberPageLink(p.id), `/leadership?member=${encodeURIComponent(p.id)}`);
 for(const p of pioneerRoster) assert.equal(memberPageLink(p.id), `/pioneers?member=${encodeURIComponent(p.id)}`);
});

test('正式环境隔离演示账号，活动配置可更新状态并保留历史关联',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'lingyi-production-test-')); t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const dataFile=join(directory,'production.json'), eventsFile=join(directory,'events.json');
 assert.throws(()=>createCommunityApi({dataFile,demo:false}),/管理员/);
 const event={id:'real-event',name:'活动配置测试',subtitle:'副标题',description:'活动说明',date:'2026.12.01',type:'比赛',location:'线上',rules:['原创作品'],status:'open',submissionsOpen:false};
 writeFileSync(eventsFile,JSON.stringify([event]));
 const config={dataFile,eventsFile,demo:false,adminEmail:'owner@example.test',adminPassword:'Admin-for-testing-2026'};
 createCommunityApi(config).close();
 let state=JSON.parse(readFileSync(dataFile,'utf8'));assert.equal(state.users.length,1);assert.equal(state.projects.length,0);assert.equal(state.events[0].example,false);
 writeFileSync(eventsFile,JSON.stringify([{...event,status:'active',submissionsOpen:true}]));createCommunityApi(config).close();
 state=JSON.parse(readFileSync(dataFile,'utf8'));assert.equal(state.events[0].status,'active');
 writeFileSync(eventsFile,'[]');assert.throws(()=>createCommunityApi(config),/不能删除/);
 assert.throws(()=>createCommunityApi({dataFile,demo:true}),/不同/);
});

test('活动结束后保留已提交作品的退回修改通道，但禁止新增参赛作品',async t=>{
 const {client}=await fixture(t,events.map(event=>event.id==='ai-build-sprint'?{...event,status:'ended',submissionsOpen:false}:event));
 const player=client(),admin=client();await player('login',playerLogin);await admin('login',adminLogin);
 await player('projects',{...submission,eventId:'ai-build-sprint'},409);
 const edited=await player('edit/campus-agent',submission);assert.equal(edited.status,'pending');assert.equal(edited.eventId,'ai-build-sprint');
 await admin('review/campus-agent',{status:'returned',note:'请补充项目说明'});
 const resubmitted=await player('edit/campus-agent',{...submission,description:'根据审核建议完善的详细说明'});assert.equal(resubmitted.status,'pending');
});

test('活动开始自动建专题、历史回填幂等、改名结束保留照片且不能跨活动串库',async t=>{
 const {client,dataFile}=await fixture(t),admin=client(),player=client(),visitor=client();
 const initial=await visitor('albums');assert.equal(initial.length,2);assert.ok(!initial.some(a=>a.eventId==='weekend-lab'));
 await player('login',playerLogin);await admin('login',adminLogin);
 await player('event-status/weekend-lab',{status:'active'},403);
 await admin('photos',{eventId:'weekend-lab',title:'未开始的活动',imageUrl:'https://example.test/image.jpg',category:'activity'},409);
 await admin('event-status/weekend-lab',{status:'active',submissionsOpen:true});
 const album=(await visitor('albums')).find(a=>a.eventId==='weekend-lab');assert.equal(album.id,'weekend-lab');assert.equal(album.photos.length,0);
 await admin('event-status/weekend-lab',{status:'active',submissionsOpen:true});assert.equal((await visitor('albums')).length,3);
 const photo={eventId:'weekend-lab',title:'本场合照',imageUrl:'https://example.test/photo.jpg',category:'activity',credit:'示例摄影'};
 await player('photos',photo,403);const added=await admin('photos',photo);assert.equal(added.eventId,'weekend-lab');
 await admin('photos',photo,409);await admin('photos',{...photo,imageUrl:'javascript:alert(1)'},400);
 let albums=await visitor('albums');assert.equal(albums.find(a=>a.eventId==='weekend-lab').photos.length,1);assert.equal(albums.find(a=>a.eventId==='ai-build-sprint').photos.length,0);
 await admin('event-status/weekend-lab',{status:'ended'});albums=await visitor('albums');assert.equal(albums.find(a=>a.eventId==='weekend-lab').photos[0].id,added.id);
 const persisted=JSON.parse(readFileSync(dataFile,'utf8'));persisted.events.find(e=>e.id==='weekend-lab').name='新的活动名称';writeFileSync(dataFile,JSON.stringify(persisted));
 const restart=fixtureServer(createCommunityApi({dataFile,demo:true}));await new Promise(r=>restart.listen(0,'127.0.0.1',r));
 try { const restored=await fetch(`http://127.0.0.1:${restart.address().port}/api/community/albums`).then(r=>r.json());assert.equal(restored.length,3);const same=restored.find(a=>a.id===album.id);assert.equal(same.name,'新的活动名称');assert.equal(same.createdAt,album.createdAt);assert.equal(same.photos[0].id,added.id); } finally {await new Promise(r=>restart.close(r));}
});

test('活动作品与广场自动共享审核状态和唯一项目 ID',async t=>{
 const {client}=await fixture(t),admin=client(),player=client(),visitor=client();await player('login',playerLogin);await admin('login',adminLogin);
 const submitted=await player('projects',{...submission,eventId:'ai-build-sprint'});
 assert.ok(!(await visitor('projects?event=ai-build-sprint')).some(p=>p.id===submitted.id));
 await admin(`review/${submitted.id}`,{status:'approved'});
 assert.equal((await visitor('projects')).filter(p=>p.id===submitted.id).length,1);
 assert.equal((await visitor('projects?event=ai-build-sprint')).filter(p=>p.id===submitted.id).length,1);
 assert.ok(!(await visitor('projects?event=autumn-hack')).some(p=>p.id===submitted.id));
 const album=(await visitor('albums')).find(a=>a.eventId==='ai-build-sprint');assert.equal(album.projectCount,2);
 await player(`edit/${submitted.id}`,{...submission,name:'修改中的作品'});
 assert.ok(!(await visitor('projects')).some(p=>p.id===submitted.id));assert.ok(!(await visitor('projects?event=ai-build-sprint')).some(p=>p.id===submitted.id));
});

async function businessFixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), '01player-business-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dataFile = join(dir, 'community.json');
  const secret = 'private-test-staff-bridge-2026';
  let server, community;
  async function start() {
    community = createCommunityApi({ dataFile, demo: true, staffSecret: secret, ...options });
    server = fixtureServer(community);
    await new Promise(done => server.listen(0, '127.0.0.1', done));
  }
  await start(); t.after(() => new Promise(done => server.close(done)));
  const send = async (path, body, headers = {}) => {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/community/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const mime = response.headers.get('content-type') || '';
    const data = mime.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    const cookie = response.headers.get('set-cookie');
    return { status: response.status, data, mime, retryAfter: response.headers.get('retry-after'), ...(cookie ? { cookie: cookie.split(';')[0], setCookie: cookie } : {}) };
  };
  return { send, dataFile, secret, resolveUser: cookie => community.resolveUser({ headers: { cookie } }),
    staff: (path, body, role = 'operator') => send(path, body, { 'x-01-staff-secret': secret, 'x-01-staff-role': role }),
    restart: async () => { await new Promise(done => server.close(done)); await start(); } };
}
const staffEvent = { name: '周末工作坊', id: 'public-workshop', description: '带上一件做出来的作品。', date: '2026.12.05 — 12.06',
  type: '共创活动', registrationMode: 'review', coverUrl: '/cms-api/media/file/cover-1.webp', formFields: [
    { id: 'track', type: 'select', label: '想参加哪个工作坊？', required: true, options: ['模型','应用'] },
    { id: 'goals', type: 'multiselect', label: '期待', required: false, options: ['学习','交朋结友'] },
  ] };
test('报名时保存投稿开关，活动开始才兑现，并在结束时停收', async t => {
  const api = await businessFixture(t);
  const startsAt = '2026-11-22T13:00:00.000Z';
  const endsAt = '2026-11-22T14:00:00.000Z';
  const id = 'scheduled-projects';
  const unchecked = 'scheduled-projects-disabled';
  const schedule = { ...staffEvent, category: 'activity', startsAt, endsAt, status: 'open',
    registrationClosesAt: '2026-11-22T12:30:00.000Z' };
  for (const [eventId, submissionsOpen] of [[id, true], [unchecked, false]]) {
    const draft = await api.staff('staff/events', { ...schedule, id: eventId, submissionsOpen });
    assert.equal(draft.data.submissionsOpen, submissionsOpen);
    assert.equal((await api.staff('staff/events/' + eventId + '/publish', {})).status, 200);
  }
  const browser = { 'x-community-request': '1' };
  const { cookie } = await api.send('login', playerLogin, browser);
  const submit = eventId => api.send('projects', { ...submission, eventId }, { ...browser, cookie });

  t.mock.timers.setTime(Date.parse(startsAt) - 1);
  const before = (await api.send('events/' + id)).data;
  assert.equal(before.status, 'open');
  assert.equal(before.registrationOpen, false);
  assert.equal(before.hasAlbum, false);
  assert.equal((await submit(id)).status, 409);

  t.mock.timers.setTime(Date.parse(startsAt));
  const current = (await api.send('events/' + id)).data;
  assert.equal(current.status, 'active');
  assert.equal(current.hasAlbum, true);
  assert.equal((await api.send('albums')).data.find(album => album.eventId === id).createdAt, startsAt);
  assert.equal((await submit(id)).data.status, 'pending');
  assert.equal((await submit(unchecked)).status, 409);

  t.mock.timers.setTime(Date.parse(endsAt));
  assert.equal((await api.send('events/' + id)).data.status, 'ended');
  assert.equal((await submit(id)).status, 409);
});

test('官网浏览入库去重，统计仅对运营开放并可重启恢复', async t => {
  const api = await businessFixture(t);
  const headers = { 'x-community-request': '1' };
  const visitor = '10000000-0000-4000-8000-000000000000';
  const first = { page:'home', id:'20000000-0000-4000-8000-000000000000', visitor };
  const second = { ...first, page:'players', id:'30000000-0000-4000-8000-000000000000' };
  assert.equal((await api.send('staff/traffic')).status, 403);
  assert.equal((await api.send('page-view', first, { ...headers, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await api.send('page-view', { ...first, page:'/admin?token=example' }, headers)).status, 400);
  for (const view of [first, first, second]) assert.equal((await api.send('page-view', view, headers)).status, 200);
  await api.restart();
  const response = await api.staff('staff/traffic');
  assert.equal(response.status, 200);
  assert.equal(response.data.today.views, 2);
  assert.equal(response.data.today.visitors, 1);
  assert.equal(response.data.views7d, 2);
  assert.equal(response.data.trend.length, 7);
  assert.deepEqual(response.data.popular.map(item => item.page), ['home', 'players']);
  assert.ok(!JSON.stringify(response.data).includes(visitor));
});
test('访问统计首次连接遇到锁时可在解锁后恢复读写', async t => {
  const api = await businessFixture(t);
  const { DatabaseSync } = await import('node:sqlite');
  const other = new DatabaseSync(api.dataFile + '.traffic.sqlite');
  try {
    other.exec('BEGIN EXCLUSIVE');
    assert.equal((await api.staff('staff/traffic')).status, 503);
  } finally {
    other.close();
  }
  const view = { page: 'home', id: '20000000-0000-4000-8000-000000000000', visitor: '10000000-0000-4000-8000-000000000000' };
  assert.equal((await api.send('page-view', view, { 'x-community-request': '1' })).status, 200);
  assert.equal((await api.staff('staff/traffic')).data.today.views, 1);
});
test('活动归档后作者仍可修改原项目并保留关联，活动不再接收新作品', async t => {
  const api = await businessFixture(t);
  const eventId = 'ai-build-sprint';
  const login = await api.send('login', playerLogin, { 'X-Community-Request': '1' });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.cookie, 'X-Community-Request': '1' };
  assert.equal((await api.staff('staff/events/' + eventId + '/archive', {})).status, 200);
  assert.equal((await api.send('projects', { ...submission, eventId }, headers)).status, 404);
  const edited = await api.send('edit/campus-agent', { ...submission, eventId: 'weekend-lab' }, headers);
  assert.equal(edited.status, 200);
  assert.equal(edited.data.eventId, eventId);
  assert.equal(edited.data.status, 'pending');
});

test('运营待办计数与活动、报名及作品的实际待办一致', async t => {
  const api = await businessFixture(t);
  const queue = 'staff/work-queue';
  assert.equal((await api.send(queue)).status, 401);
  assert.equal((await api.staff(queue, {})).status, 404);
  async function check(events, registrations, projects = 0) {
    const result = await api.staff(queue);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { events, registrations, projects });
    const eventList = (await api.staff('staff/events')).data;
    const roster = (await api.staff('staff/registrations')).data;
    assert.equal(events, eventList.filter(row => matchesFilter('events', row, 'unpublished')).length);
    assert.equal(registrations, roster.filter(row => matchesFilter('registrations', row, 'pending')).length);
    const works = (await api.staff('staff/projects')).data;
    assert.equal(projects, works.filter(row => matchesFilter('projects', row, 'pending')).length);
  }
  const path = 'staff/events/' + staffEvent.id;
  await api.staff('staff/events', { ...staffEvent, formFields: [] });
  await check(1, 0);
  await api.staff(path + '/publish', {});
  const receipt = await api.send('events/' + staffEvent.id + '/registrations', {
    name: '玩家', contact: 'queue@example.test', idempotencyKey: 'stable-work-queue-key',
  });
  assert.equal(receipt.status, 200);
  await check(0, 1);
  await api.staff(path, { name: '未发布的修订' });
  await check(1, 1);
  await api.staff(path + '/archive', {});
  await api.staff('staff/registrations/' + receipt.data.id + '/review', { status: 'rejected' });
  await check(1, 0);
  await api.staff(path + '/publish', {});
  await check(0, 0);
  const headers = { 'x-community-request': '1' };
  const login = await api.send('login', playerLogin, headers);
  const player = { ...headers, cookie: login.cookie };
  const project = await api.send('projects', submission, player);
  assert.equal(project.status, 200);
  await check(0, 0, 1);
  const review = 'staff/projects/' + project.data.id + '/review';
  assert.equal((await api.staff(review, { status: 'returned', note: '补充项目说明' })).status, 200);
  await check(0, 0);
  assert.equal((await api.send('edit/' + project.data.id, submission, player)).status, 200);
  await check(0, 0, 1);
  assert.equal((await api.staff(review, { status: 'approved' })).status, 200);
  await check(0, 0);
});

test('运营分页名单先筛选再分页，审核后夹到末页，保留原名单权限与脱敏规则', async t => {
  const api = await businessFixture(t);
  const route = 'staff/registrations';
  assert.equal((await api.send(route + '?page=1')).status, 401);
  await api.staff('staff/events', { ...staffEvent, formFields: [] });
  await api.staff('staff/events/' + staffEvent.id + '/publish', {});
  for (let i = 0; i < 3; i++) {
    assert.equal((await api.send('events/' + staffEvent.id + '/registrations', {
      name: '分页玩家 ' + i, contact: 'r' + i + '@example.test', idempotencyKey: 'roster-page-test-' + i,
    })).status, 200);
  }
  const headers = { 'x-community-request': '1' };
  const { cookie } = await api.send('login', playerLogin, headers);
  assert.equal((await api.send(route + '?page=1', undefined, {cookie})).status, 403);
  assert.equal((await api.send('register-event', {eventId:'weekend-lab', name:'已登录玩家', contact:'member@example.test'}, {...headers,cookie})).status, 200);
  const all = (await api.staff(route)).data;
  assert.ok(Array.isArray(all));
  assert.equal(all.length, 4);
  const first = (await api.staff(route + '?page=1')).data;
  assert.deepEqual(first, {items:all, total:4, page:1, pageSize:20, totalPages:1});
  assert.deepEqual(first.items.map(row => row.accountId), [null, null, null, 'demo-player']);
  for (const row of first.items) {
    assert.equal(Object.hasOwn(row, 'keyDigest'), false);
    assert.equal(Object.hasOwn(row, 'requestDigest'), false);
  }
  const query = route + '?event=' + staffEvent.id + '&status=pending&pageSize=2';
  const last = (await api.staff(query + '&page=2')).data;
  assert.deepEqual(last, {items:all.slice(2,3), total:3, page:2, pageSize:2, totalPages:2});
  await api.staff(route + '/' + all[2].id + '/review', {status:'approved'});
  assert.deepEqual((await api.staff(query + '&page=1&summary=1')).data.statusCounts, { approved: 1, pending: 2 });
  assert.deepEqual((await api.staff(query + '&page=99')).data,
    {items:all.slice(0,2), total:2, page:1, pageSize:2, totalPages:1});
  assert.deepEqual((await api.staff(route + '?event=absent&pageSize=1')).data,
    {items:[], total:0, page:1, pageSize:1, totalPages:0});
  for (const bad of ['page=0','page=1.5','pageSize=101','pageSize=','page=9007199254740992']) {
    assert.equal((await api.staff(route + '?' + bad)).status, 400);
  }
});
test('后台活动草稿、发布快照、归档、旧日期、问卷校验与后台授权', async t => {
  const api = await businessFixture(t);
  assert.equal((await api.send('staff/events', staffEvent)).status, 403);
  assert.equal((await api.send('staff/registrations')).status, 401);
  assert.equal((await api.staff('staff/registrations', undefined, 'editor')).status, 401);
  assert.equal((await api.staff('staff/events', { ...staffEvent, coverUrl: '/cms-api/media/file/%2e%2e/keys' })).status, 400);
  assert.equal((await api.staff('staff/events', { ...staffEvent, formFields: [staffEvent.formFields[0],staffEvent.formFields[0]] })).status, 400);
  assert.equal((await api.staff('staff/events', { ...staffEvent, category: 'salon' })).data.publicationStatus, 'draft');
  assert.equal((await api.staff('staff/events', { ...staffEvent, name: '同 ID 的另一场' })).status, 409);
  assert.equal((await api.send('events/public-workshop')).status, 404);
  assert.equal((await api.staff('staff/events/public-workshop/publish', {})).data.publicationStatus, 'published');
  const first = (await api.send('events/public-workshop')).data;
  assert.equal(first.category, 'salon');
  assert.equal((await api.send('events?view=card')).data.find(event => event.id === first.id).category, 'salon');
  assert.equal(first.registrationOpen, true); assert.equal(first.startsAt, '2026-12-04T16:00:00.000Z');
  const staged = (await api.staff('staff/events/public-workshop', { name: '正式名称', registrationClosesAt: '2019-11-20T10:00:00+08:00' })).data;
  assert.equal(staged.hasDraftChanges, true); assert.equal(staged.name, '正式名称');
  assert.equal((await api.send('events/public-workshop')).data.name, staffEvent.name);
  await api.restart();
  assert.equal((await api.staff('staff/events/public-workshop')).data.name, '正式名称');
  await api.staff('staff/events/public-workshop/publish', {});
  assert.equal((await api.send('events/public-workshop')).data.registrationOpen, false);
  await api.staff('staff/events/public-workshop/archive', {});
  assert.equal((await api.send('events/public-workshop')).status, 404);
  assert.ok(!(await api.send('events')).data.some(e => e.id === 'public-workshop'));
  assert.equal((await api.staff('staff/events/public-workshop')).data.publicationStatus, 'archived');
});
test('赛事投稿仅接受已公布且开放投稿的场次，包括社区管理员投稿', async t => {
  const api = await businessFixture(t);
  const event = { ...staffEvent, type: '比赛', status: 'active', submissionsOpen: true };
  const route = 'staff/events/' + event.id;
  const headers = { 'x-community-request': '1' };
  const player = { ...headers, cookie: (await api.send('login', playerLogin, headers)).cookie };
  const admin = { ...headers, cookie: (await api.send('login', adminLogin, headers)).cookie };
  const entry = { ...submission, eventId: event.id };

  assert.equal((await api.staff('staff/events', event)).status, 200);
  assert.ok(!(await api.send('events')).data.some(item => item.id === event.id));
  assert.equal((await api.send('projects', entry, player)).status, 404);
  assert.equal((await api.send('projects', entry, admin)).status, 404);

  assert.equal((await api.staff(route + '/publish', {})).status, 200);
  const posted = await api.send('projects', entry, player);
  assert.equal(posted.status, 200);
  assert.equal(posted.data.eventId, event.id);

  assert.equal((await api.staff(route + '/archive', {})).status, 200);
  assert.equal((await api.send('projects', entry, player)).status, 404);
  assert.equal((await api.send('projects', entry, admin)).status, 404);
  assert.equal((await api.send('edit/' + posted.data.id, submission, player)).data.eventId, event.id);
});
test('无账号报名并发幂等，跨设备重复保护，私有回执，操作员审核与重启', async t => {
  const api = await businessFixture(t);
  await api.staff('staff/events', staffEvent); await api.staff('staff/events/public-workshop/publish', {});
  const endpoint = 'events/public-workshop/registrations';
  const body = { name: '一位玩家', contact: 'myname@example.test', answers: { track: '应用', goals: ['学习'] }, idempotencyKey: 'random-key-123456789' };
  assert.equal((await api.send(endpoint, { ...body, answers: {} })).status, 400);
  assert.equal((await api.send(endpoint, { ...body, answers: { track: '无效' } })).status, 400);
  assert.equal((await api.send(endpoint, { ...body, answers: { track: '应用', junk: 1 } })).status, 400);
  assert.equal((await api.send(endpoint, body, { Origin: 'https://invalid.test', 'X-Community-Request': '1' })).status, 403);
  const [a,b] = await Promise.all([api.send(endpoint, body), api.send(endpoint, body)]);
  assert.equal(a.status, 200); assert.deepEqual(a.data, b.data); assert.equal(a.data.status, 'pending'); assert.ok(a.data.receiptToken.length > 20);
  assert.equal((await api.send(endpoint, { ...body, name: '另一个人' })).status, 409);
  assert.equal((await api.send(endpoint, { ...body, idempotencyKey: 'another-key-12345678' })).status, 409);
  const roster = (await api.staff('staff/registrations?event=public-workshop')).data;
  assert.equal(roster.length, 1); assert.equal(roster[0].answers.track, '应用'); assert.equal(roster[0].formFields[0].label, staffEvent.formFields[0].label);
  assert.ok(!('keyDigest' in roster[0])); assert.ok(!('receiptToken' in roster[0])); assert.ok(!('contact' in a.data));
  assert.equal((await api.send('registration-status', { id: a.data.id, receiptToken: 'guessed' })).status, 404);
  const success = await api.staff('staff/registrations/' + a.data.id + '/review', { status: 'approved', note: '仅运营可见' });
  assert.equal(success.data.status, 'approved');
  await api.staff('staff/events/public-workshop/archive', {}); await api.restart();
  const restored = await api.send('registration-status', { id: a.data.id, receiptToken: a.data.receiptToken });
  assert.equal(restored.data.status, 'approved'); assert.ok(!JSON.stringify(restored.data).includes('仅运营可见'));
  assert.equal((await api.send(endpoint, body)).data.receiptToken, a.data.receiptToken);
  assert.equal((await api.send('events/weekend-lab/registrations', { ...body, answers: {} })).data.status, 'approved');
  assert.ok(!readFileSync(api.dataFile, 'utf8').includes(a.data.receiptToken));
  assert.ok(!readFileSync(api.dataFile, 'utf8').includes(body.idempotencyKey));
});
test('票根进群二维码仅随已通过的回执读取，草稿变更发布后生效', async t => {
  const api = await businessFixture(t);
  const qr = '/cms-api/media/file/group-qr.png';
  const path = 'staff/events/public-workshop';
  await api.staff('staff/events', { ...staffEvent, formFields: [], ticketGroupQrUrl: qr });
  await api.staff(path + '/publish', {});
  assert.ok(!Object.hasOwn((await api.send('events/public-workshop')).data, 'ticketGroupQrUrl'));
  assert.ok(!JSON.stringify((await api.send('events')).data).includes(qr));

  const browser = { 'x-community-request': '1' };
  const { cookie } = await api.send('login', playerLogin, browser);
  const submitted = await api.send('events/public-workshop/registrations', {
    name: '二维码验收玩家', phone: '13812121213', answers: {}, idempotencyKey: 'ticket-group-qr-fixture',
  }, { ...browser, cookie });
  assert.equal(submitted.data.status, 'pending');
  assert.ok(!Object.hasOwn(submitted.data, 'ticketGroupQrUrl'));
  const credentials = { id: submitted.data.id, receiptToken: submitted.data.receiptToken };
  const refresh = async () => (await api.send('registration-status', credentials)).data;
  const mine = async () => (await api.send('mine', undefined, { cookie })).data.registrations[0];
  assert.ok(!Object.hasOwn(await refresh(), 'ticketGroupQrUrl'));
  assert.ok(!Object.hasOwn(await mine(), 'ticketGroupQrUrl'));
  assert.equal((await api.send('registration-status', { ...credentials, receiptToken: 'invalid' })).status, 404);

  await api.staff('staff/registrations/' + submitted.data.id + '/review', { status: 'approved' });
  assert.equal((await refresh()).ticketGroupQrUrl, qr);
  assert.equal((await mine()).ticketGroupQrUrl, qr);
  const draft = (await api.staff(path, { ticketGroupQrUrl: '' })).data;
  assert.equal(draft.ticketGroupQrUrl, '');
  assert.equal(draft.publishedTicketGroupQrUrl, qr);
  assert.equal((await refresh()).ticketGroupQrUrl, qr);
  await api.staff(path + '/publish', {});
  assert.ok(!Object.hasOwn(await refresh(), 'ticketGroupQrUrl'));
  assert.ok(!Object.hasOwn(await mine(), 'ticketGroupQrUrl'));
});

test('活动与作品各有三个官网置顶位，支持改位、清除和下架释放', async t => {
  const api = await businessFixture(t);
  const eventPins = 'staff/home-pins/events';
  const projectPins = 'staff/home-pins/projects';
  const empty = [null, null, null];
  assert.deepEqual((await api.staff(eventPins)).data.slots, empty);
  assert.equal((await api.send(eventPins)).status, 401);
  const selected = ['weekend-lab', null, 'ai-build-sprint'];
  assert.equal((await api.staff(eventPins, { slots: ['weekend-lab', 'weekend-lab', null], expected: empty })).status, 400);
  assert.equal((await api.staff(eventPins, { slots: ['unavailable-event', null, null], expected: empty })).status, 409);
  assert.deepEqual((await api.staff(eventPins, { slots: selected, expected: empty })).data.slots, selected);
  assert.deepEqual((await api.staff(eventPins, { slots: selected, expected: empty })).data.slots, selected);
  assert.equal((await api.staff(eventPins, { slots: [null, 'weekend-lab', null], expected: empty })).status, 409);
  const publicEvents = (await api.send('events?view=card')).data;
  assert.deepEqual(featuredInSlots(publicEvents, 2).map(row => row.id),
    ['weekend-lab', 'autumn-hack', 'ai-build-sprint']);

  const projects = ['study-map', 'tiny-garden', 'campus-agent'];
  assert.deepEqual((await api.staff(projectPins, { slots: projects, expected: empty })).data.slots, projects);
  const publicProjects = (await api.send('projects')).data;
  assert.deepEqual(featuredInSlots(publicProjects, 3).map(row => row.id), projects);
  assert.equal((await api.staff('staff/projects')).data.find(row => row.id === 'tiny-garden').homePinPosition, 2);
  await api.restart();
  assert.deepEqual((await api.staff(eventPins)).data.slots, selected);
  await api.staff('staff/events/weekend-lab/archive', {});
  const remaining = [null, null, 'ai-build-sprint'];
  assert.deepEqual((await api.staff(eventPins)).data.slots, remaining);
  await api.staff('staff/events/weekend-lab/publish', {});
  assert.ok(!Object.hasOwn((await api.send('events/weekend-lab')).data, 'homePinPosition'));
  assert.deepEqual((await api.staff(eventPins, { slots: empty, expected: remaining })).data.slots, empty);
  assert.deepEqual((await api.staff(projectPins)).data.slots, projects);

  const browser = { 'x-community-request': '1' };
  const { cookie } = await api.send('login', playerLogin, browser);
  assert.equal((await api.send('edit/campus-agent', submission, { ...browser, cookie })).status, 200);
  assert.deepEqual((await api.staff(projectPins)).data.slots, ['study-map', 'tiny-garden', null]);
  assert.equal((await api.staff(projectPins, { slots: projects, expected: ['study-map', 'tiny-garden', null] })).status, 409);
});

test('同一场馆可集中报名，登录与免登录入口共用持续限额并告知重试时间', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request': '1' };
  const login = await api.send('login', playerLogin, browser);
  const signed = { ...browser, cookie: login.cookie };
  const submit = i => api.send('events/weekend-lab/registrations', {
    name: '测试玩家', contact: 'venue-' + i, idempotencyKey: 'venue-signup-key-' + i,
  });
  const applicants = await Promise.all(Array.from({ length: 100 }, (_, i) => submit(i)));
  assert.ok(applicants.every(r => r.status === 200));
  assert.equal(new Set(applicants.map(r => r.data.id)).size, 100);

  // Leave room for the app's ordinary replays after a lost response.
  for (let i = 0; i < 10; i++) assert.deepEqual((await submit(i)).data, applicants[i].data);
  const form = { eventId: 'weekend-lab', name: '官网报名', contact: 'web@example.test' };
  const limited = await api.send('register-event', form, signed);
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfter, '2');
  assert.equal((await api.send('registration-status', applicants[0].data)).status, 200);
  t.mock.timers.tick(2000);
  assert.equal((await api.send('register-event', form, signed)).status, 200);
  assert.equal((await submit(100)).status, 429);
  const rows = await api.staff('staff/registrations');
  assert.equal(rows.data.length, 101);
});

test('同一网络上查看已持有的回执，不会耗尽其他玩家提交报名或查询自己回执的额度', async t => {
  const api = await businessFixture(t);
  const signUp = async (number) => {
    const result = await api.send('events/weekend-lab/registrations', {
      name:'本地玩家', contact:'participant-' + number, idempotencyKey:'local-device-test-' + number,
    });
    assert.equal(result.status, 200, result.data.error);
    return { id:result.data.id, receiptToken:result.data.receiptToken };
  };
  const first = await signUp(1);
  const second = await signUp(2);
  for (let i = 0; i < 35; i++) assert.equal((await api.send('registration-status', first)).status, 200);
  assert.equal((await api.send('registration-status', first)).status, 429);
  assert.equal((await api.send('registration-status', second)).status, 200);
  await signUp(3);
  const expiredCredential = { id:second.id, receiptToken:'expired-local-receipt' };
  for (let i = 0; i < 35; i++) assert.equal((await api.send('registration-status', expiredCredential)).status, 404);
  assert.equal((await api.send('registration-status', expiredCredential)).status, 429);
  assert.equal((await api.send('registration-status', second)).status, 200);
  t.mock.timers.tick(60000);
  assert.equal((await api.send('registration-status', first)).status, 200);
});


test('运营人员管理已开始的专题照片，公开更新归档和图片引用', async t => {
  const api = await businessFixture(t);
  const body = { eventId:'ai-build-sprint', title:'活动合照', credit:'示例', category:'activity', imageUrl:'/cms-api/media/file/workshop-photo.webp' };
  assert.equal((await api.send('staff/photos')).status,401);
  assert.equal((await api.staff('staff/photos',{...body,eventId:'weekend-lab'})).status,409);
  const photo=(await api.staff('staff/photos',body)).data;
  assert.ok(photo.id); assert.equal(photo.image,body.imageUrl);
  assert.equal((await api.staff('staff/photos',body)).status,409);
  assert.equal((await api.staff('staff/photos/'+photo.id,{eventId:'autumn-hack'})).status,400);
  assert.equal((await api.staff('staff/photos/'+photo.id,{imageUrl:'/cms-api/media/file/%2e%2e/private'})).status,400);
  const updated=(await api.staff('staff/photos/'+photo.id,{credit:'新署名',category:'competition'})).data;
  assert.equal(updated.credit,'新署名');
  assert.equal((await api.send('albums')).data.find(a=>a.eventId===body.eventId).photos[0].category,'competition');
  assert.equal((await api.staff('staff/photos/'+photo.id,{category:'team-building'})).status,200);
  assert.equal((await api.send('albums')).data.find(a=>a.eventId===body.eventId).photos[0].category,'team-building');
  await api.staff('staff/events/ai-build-sprint/archive',{});
  assert.ok(!(await api.send('albums')).data.some(a=>a.eventId===body.eventId));
  assert.equal((await api.staff('staff/photos/'+photo.id,{title:'归档后'})).status,409);
  assert.equal((await api.staff('staff/photos?event=ai-build-sprint')).data[0].id,photo.id);
  assert.equal((await api.staff('staff/photos/'+photo.id+'/remove',{})).status,200);
  assert.deepEqual((await api.staff('staff/photos?event=ai-build-sprint')).data,[]);
});

test('运营人员可以修改既有历史照片，保留原图并同步到公开时光机', async t => {
  const api = await businessFixture(t);
  const original = historicalArchivePhotos.find(photo => photo.fullImage !== photo.image);
  const path = 'staff/photos/' + original.id;
  const changes = { title: '新的现场照片说明', credit: '新的署名' };
  assert.equal((await api.send(path, changes, { 'x-community-request': '1' })).status, 401);
  assert.equal((await api.staff(path, { eventId: 'ai-build-sprint', ...changes })).status, 400);
  assert.equal((await api.staff('staff/photos/history-photo-missing', changes)).status, 404);
  assert.equal((await api.staff(path, changes)).status, 200);
  await api.restart();
  const { albums, historicalPhotos } = (await api.send('albums?historical=1')).data;
  assert.deepEqual(historicalPhotos, [{ id: original.id, image: original.image, fullImage: original.fullImage, ...changes }]);
  assert.deepEqual(albums, (await api.send('albums')).data);
  const stored = (await api.staff('staff/photos?event=' + original.eventId)).data;
  assert.equal(stored[0].title, changes.title);
  const replacement = '/cms-api/media/file/history-replacement.webp';
  assert.equal((await api.staff(path, { imageUrl: replacement })).data.fullImage, replacement);
  assert.equal((await api.send('albums?historical=1')).data.historicalPhotos[0].image, replacement);
});

test('草稿与归档活动对新报名不可见，活动结束瞬间关闭报名入口并保留原回执', async t => {
  const api = await businessFixture(t);
  const path = 'events/public-workshop';
  const endpoint = path + '/registrations';
  const entry = { name: '玩家', contact: 'first@example.test', idempotencyKey: 'demo-retry-key-1234', answers: { track: '应用' } };
  await api.staff('staff/events', { ...staffEvent, endsAt: '2026-11-22T12:00:01Z' });
  const absent = await api.send('events/unknown/registrations', entry);
  assert.equal(absent.status, 404);
  assert.deepEqual(await api.send(endpoint, entry), absent);
  await api.staff('staff/events/public-workshop/publish', {});
  assert.equal((await api.send(path)).data.startsAt, null);
  const receipt = (await api.send(endpoint, entry)).data;
  assert.ok(receipt.receiptToken);
  t.mock.timers.tick(1000);
  assert.equal((await api.send(path)).data.registrationOpen, false);
  const another = { ...entry, contact: 'second@example.test', idempotencyKey: 'demo-retry-key-5678' };
  assert.equal((await api.send(endpoint, another)).status, 409);
  assert.deepEqual((await api.send(endpoint, entry)).data, receipt);
  await api.staff('staff/events/public-workshop/archive', {});
  assert.deepEqual(await api.send(endpoint, another), absent);
  assert.deepEqual((await api.send(endpoint, entry)).data, receipt);

  // Date-only legacy events end at the end of their final Beijing calendar day.
  t.mock.timers.setTime(Date.parse('2026-12-06T15:59:59.999Z'));
  assert.equal((await api.send('events/weekend-lab')).data.registrationOpen, true);
  t.mock.timers.tick(1);
  assert.equal((await api.send('events/weekend-lab')).data.registrationOpen, false);
});

test('提交以原问卷和已保存答案判重，重复审核保留首次操作人及时间', async t => {
  const api = await businessFixture(t);
  const fields = [...staffEvent.formFields, { id: 'toString', type: 'text', label: '补充说明', required: false }];
  await api.staff('staff/events', { ...staffEvent, formFields: fields });
  await api.staff('staff/events/public-workshop/publish', {});
  const endpoint = 'events/public-workshop/registrations';
  const body = { name: '玩家', contact: 'player@example.test', idempotencyKey: 'stable-test-key-1234', answers: { track: '应用', goals: ['学习', '交朋结友'] } };
  assert.equal((await api.send(endpoint, { ...body, answers: { ...body.answers, toString: [] } })).status, 400);
  const first = await api.send(endpoint, body);
  assert.equal(first.status, 200);
  await api.staff('staff/events/public-workshop', { formFields: [] });
  await api.staff('staff/events/public-workshop/publish', {});
  const replay = await api.send(endpoint, { ...body, answers: { goals: ['交朋结友', '学习'], track: '  应用  ' } });
  assert.deepEqual(replay.data, first.data);
  assert.equal((await api.send(endpoint, { ...body, answers: { track: '模型' } })).status, 409);
  const review = 'staff/registrations/' + first.data.id + '/review';
  const approved = await api.staff(review, { status: 'approved', note: '已确认' });
  assert.equal(approved.data.status, 'approved');
  t.mock.timers.tick(1000);
  const duplicate = await api.staff(review, { status: 'approved', note: '已确认' }, 'admin');
  assert.deepEqual(duplicate.data, approved.data);
  assert.equal((await api.staff(review, { status: 'rejected' }, 'admin')).status, 409);
  const receipt = await api.send('registration-status', { id: first.data.id, receiptToken: first.data.receiptToken });
  assert.equal(receipt.data.status, 'approved');
  assert.equal(receipt.data.updatedAt, approved.data.updatedAt);
  assert.equal((await api.staff('staff/registrations?event=public-workshop')).data.length, 1);
  const reopened = await api.staff(review, { status: 'pending' });
  const rejected = await api.staff(review, { status: 'rejected' });
  assert.ok(Date.parse(rejected.data.updatedAt) > Date.parse(reopened.data.updatedAt));
  assert.equal((await api.send('registration-status', { id:first.data.id,receiptToken:first.data.receiptToken })).data.updatedAt, rejected.data.updatedAt);
});

test('官网玩家在我的参与看到自己的原报名和审核状态，运营备注与操作人只保留在审核名单', async t => {
  const api = await businessFixture(t);
  await api.staff('staff/events', { ...staffEvent, formFields: [] });
  await api.staff('staff/events/public-workshop/publish', {});
  const browser = { 'x-community-request':'1' };
  const { cookie } = await api.send('login', playerLogin, browser);
  const form = { eventId:'public-workshop',name:'报名玩家',contact:'member@example.test',note:'本人填写的备注' };
  const submission = await api.send('register-event', form, { ...browser, cookie });
  assert.equal(submission.status,200);
  await api.staff('staff/registrations/' + submission.data.id + '/review', { status:'rejected', note:'内部核对记录' });
  await api.restart();
  const [mine] = (await api.send('mine', undefined, {cookie})).data.registrations;
  assert.equal(mine.id,submission.data.id);
  for (const [key,value] of Object.entries(form)) assert.equal(mine[key],value);
  assert.equal(mine.status,'rejected');
  assert.ok(mine.updatedAt);
  assert.ok(!Object.hasOwn(mine,'reviewNote') && !Object.hasOwn(mine,'reviewedBy'));
  const [staff] = (await api.staff('staff/registrations?status=rejected&page=1')).data.items;
  assert.equal(staff.id,mine.id);
  assert.equal(staff.reviewNote,'内部核对记录');
  assert.equal(staff.reviewedBy,'operator');
});

test('运营时间拒绝不存在的日期，刚发布活动的专题标记与随后的读取一致', async t => {
  const api = await businessFixture(t);
  const invalid = await api.staff('staff/events', { ...staffEvent, startsAt: '2027-02-29T17:00:00+08:00' });
  assert.equal(invalid.status, 400);
  const valid = await api.staff('staff/events', { ...staffEvent, startsAt: '2028-02-29T17:00:00+08:00', status: 'active' });
  assert.equal(valid.status, 200);
  const published = await api.staff('staff/events/public-workshop/publish', {});
  assert.equal(published.data.hasAlbum, true);
  assert.equal((await api.send('events/public-workshop')).data.hasAlbum, true);
});

test('后台原样保存与撤销改名不会留下草稿，修改旧版展示日期会更新公开日历', async t => {
  const api = await businessFixture(t);
  const edit = 'staff/events/weekend-lab';
  const original = (await api.staff(edit)).data;
  assert.equal(original.startsAt, null);
  assert.equal((await api.staff(edit, original)).data.hasDraftChanges, false);
  const untouched = JSON.parse(readFileSync(api.dataFile, 'utf8')).events.find(event => event.id === original.id);
  assert.notEqual(untouched.managedBy, 'staff');
  await api.staff(edit, { name: '编辑中的标题' });
  assert.equal((await api.staff(edit, { name: original.name })).data.hasDraftChanges, false);
  await api.staff(edit, { ...original, date: '2027.02.24' });
  await api.staff(edit + '/publish', {});
  assert.equal((await api.send('events/weekend-lab')).data.startsAt, '2027-02-23T16:00:00.000Z');
});

test('官网运营关闭报名后，稍后发布已有的文案草稿不会意外重新开放', async t => {
  const { client } = await fixture(t);
  const admin = client(), visitor = client();
  await admin('login', adminLogin);
  await admin('staff/events/weekend-lab', { subtitle: '新的活动文案' });
  await admin('event-status/weekend-lab', { status: 'ended' });
  await admin('staff/events/weekend-lab/publish', {});
  const event = await visitor('events/weekend-lab');
  assert.equal(event.subtitle, '新的活动文案');
  assert.equal(event.status, 'ended');
  assert.equal(event.registrationOpen, false);
});

test('两个运营同时编辑只接受先保存的版本，同一操作可重试，旧版客户端仍可使用', async t => {
  const api = await businessFixture(t);
  const edit = 'staff/events/public-workshop';
  const create = await api.staff('staff/events', staffEvent);
  assert.equal(typeof create.data.draftRevision, 'string');
  // Existing callers publish and save without a revision.
  assert.equal((await api.staff(edit + '/publish', {})).status, 200);
  assert.equal((await api.staff(edit, { subtitle: '初稿' })).status, 200);
  const first = (await api.staff(edit)).data;
  const second = (await api.staff(edit)).data;
  const next = { ...first, name: '编辑 A 的活动标题' };
  const saved = (await api.staff(edit, next)).data;
  assert.notEqual(saved.draftRevision, first.draftRevision);
  assert.deepEqual((await api.staff(edit, next)).data, saved);
  const stale = await api.staff(edit, { ...second, name: '编辑 B 的活动标题' });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /重新打开/);
  assert.equal((await api.staff(edit + '/archive', { draftRevision: second.draftRevision })).status, 409);
  assert.equal((await api.staff(edit + '/publish', { draftRevision: second.draftRevision })).status, 409);

  const approve = { draftRevision: saved.draftRevision };
  const published = await api.staff(edit + '/publish', approve);
  assert.equal(published.data.name, next.name);
  await api.restart();
  assert.deepEqual((await api.staff(edit + '/publish', approve)).data, published.data);
  const live = (await api.send('events/public-workshop')).data;
  assert.equal(live.name, next.name);
  assert.ok(!Object.hasOwn(live, 'lastEventMutation') && !Object.hasOwn(live, 'draftRevision'));

  const archive = { draftRevision: published.data.draftRevision };
  const archived = await api.staff(edit + '/archive', archive);
  assert.equal(archived.data.publicationStatus, 'archived');
  assert.deepEqual((await api.staff(edit + '/archive', archive)).data, archived.data);
  assert.equal((await api.staff(edit + '/publish', approve)).status, 409);
  assert.equal((await api.send('events/public-workshop')).status, 404);
});

test('新建草稿回包丢失可用固定 ID 重试，内容不同、已经修改或发布的同 ID 均提示冲突', async t => {
  const api = await businessFixture(t);
  const create = data => api.staff('staff/events', data);
  const normalised = { ...staffEvent, name: '  ' + staffEvent.name + ' ', status: 'open' };
  const [first, duplicate] = await Promise.all([create(staffEvent), create(normalised)]);
  assert.equal(first.status, 200);
  assert.deepEqual(duplicate.data, first.data);
  await api.restart();
  assert.deepEqual((await create(normalised)).data, first.data);
  assert.equal((await api.staff('staff/events')).data.filter(event => event.id === staffEvent.id).length, 1);
  assert.equal((await create({ ...staffEvent, name: '另一场活动' })).status, 409);
  const edit = 'staff/events/' + staffEvent.id;
  await api.staff(edit, { name: '已改名' });
  assert.equal((await create({ ...staffEvent, name: '已改名' })).status, 409);
  await api.staff(edit, { name: staffEvent.name });
  assert.equal((await create(staffEvent)).status, 409);
  await api.staff(edit + '/publish', {});
  assert.equal((await create(staffEvent)).status, 409);
  await api.staff(edit + '/archive', {});
  assert.equal((await create(staffEvent)).status, 409);
});

test('运营查询账号按真实状态分页和搜索，旧字段可缺省，审核只关联真实账号 ID', async t => {
  const api = await businessFixture(t);
  const old = JSON.parse(readFileSync(api.dataFile, 'utf8'));
  delete old.users[0].createdAt;
  writeFileSync(api.dataFile, JSON.stringify(old));
  await api.restart();
  assert.equal((await api.send('staff/users')).status, 401);
  const ownHeaders = { 'x-community-request': '1' };
  const login = await api.send('login', playerLogin, ownHeaders);
  const player = { ...ownHeaders, cookie: login.cookie };
  assert.equal((await api.send('staff/users', undefined, player)).status, 403);
  const signup = await api.send('register', { name:'独立成员',email:'qa@example.test',password:'Test-password-1234' }, ownHeaders);
  assert.equal(signup.status, 200);
  const listing = (await api.staff('staff/users?status=active&page=1&pageSize=2')).data;
  const remaining = (await api.staff('staff/users?status=active&page=2&pageSize=2')).data;
  assert.deepEqual([listing.total, listing.totalPages, listing.items.length, remaining.items.length], [3,2,2,1]);
  assert.equal(new Set([...listing.items, ...remaining.items].map(user => user.id)).size, 3);
  const players = (await api.staff('staff/users?role=player&offset=1&pageSize=1')).data;
  assert.equal(players.total, 2);
  assert.deepEqual(players.items.map(user => [user.id, user.role]), [['demo-player', 'player']]);
  const lookup = (await api.staff('staff/users?q=' + encodeURIComponent('ＱＡ@'))).data;
  assert.equal(lookup.items[0].id, signup.data.user.id);
  assert.equal(lookup.items[0].activeSessions, 1);
  assert.equal((await api.staff('staff/users?page=-1')).status, 400);
  assert.equal((await api.staff('staff/users?pageSize=101')).status, 400);
  assert.equal((await api.staff('staff/users?status=unknown')).status, 400);
  assert.equal((await api.staff('staff/users/missing')).status, 404);
  const legacy = (await api.staff('staff/users/demo-player')).data;
  assert.deepEqual(Object.keys(legacy).sort(), [
    'id','name','email','role','status','createdAt','lastLoginAt','disabledAt','activeSessions','projectCount','registrationCount','accountHistory','accountRevision','university','likedCount','savedCount',
  ].sort());
  assert.equal(legacy.createdAt, null);
  assert.equal(legacy.status, 'active');
  assert.ok(legacy.lastLoginAt);
  assert.equal(legacy.projectCount, 1);
  const linked = (await api.send('register-event', { eventId:'weekend-lab', name:'社区玩家', contact:'different@example.test' }, player)).data;
  const anonymous = (await api.send('events/weekend-lab/registrations', { name:'微信报名',contact:playerLogin.email,idempotencyKey:'example-anonymous-1234' })).data;
  const signups = (await api.staff('staff/registrations')).data;
  assert.equal(signups.find(row => row.id === linked.id).accountId, 'demo-player');
  assert.equal(signups.find(row => row.id === anonymous.id).accountId, null);
  assert.equal((await api.staff('staff/users/demo-player')).data.registrationCount, 1);
  const projects = (await api.staff('staff/projects')).data;
  assert.equal(projects.find(row => row.id === 'campus-agent').accountId, 'demo-player');
  assert.equal(projects.find(row => row.id === 'study-map').accountId, null);
});

test('负责人统一停用、恢复和撤销所有设备会话，重复动作不产生新历史', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request': '1' };
  const { cookie:phone } = await api.send('login', playerLogin, browser);
  const { cookie:laptop } = await api.send('login', playerLogin, browser);
  const { cookie:admin } = await api.send('login', adminLogin, browser);
  const manage = (action, role = 'owner') => api.staff('staff/users/demo-player/' + action, {}, role);
  assert.equal((await manage('disable', 'operator')).status, 403);
  assert.equal((await api.send('staff/users/demo-player/disable', {}, { ...browser, cookie:admin })).status, 403);
  assert.equal((await api.send('staff/users', undefined, { ...browser, cookie:admin })).status, 403);
  assert.equal((await api.send('staff/users/demo-player', undefined, { ...browser, cookie:admin })).status, 403);
  assert.equal((await api.staff('staff/users/demo-player')).data.activeSessions, 2);
  const disabled = (await manage('disable')).data;
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.activeSessions, 0);
  assert.deepEqual(disabled.accountHistory, [{ kind:'disable', at:disabled.disabledAt, actorId:'owner' }]);
  t.mock.timers.tick(1000);
  assert.deepEqual((await manage('disable')).data, disabled);
  assert.equal((await api.staff('staff/users?status=disabled')).data.items[0].id, 'demo-player');
  for (const cookie of [phone, laptop]) {
    assert.equal(api.resolveUser(cookie), null);
    assert.equal((await api.send('session', undefined, { cookie })).data.user, null);
    assert.equal((await api.send('mine', undefined, { cookie })).status, 401);
  }
  assert.equal((await api.send('login', playerLogin, browser)).status, 403);
  assert.equal(api.resolveUser(admin).id, 'admin');
  await api.restart();
  const restored = (await manage('restore')).data;
  assert.equal(restored.status, 'active');
  assert.equal(restored.disabledAt, null);
  assert.deepEqual(restored.accountHistory.map(row => row.kind), ['restore','disable']);
  assert.equal(api.resolveUser(phone), null);
  assert.equal((await manage('revoke-sessions')).data.accountHistory.length, 2);
  const fresh = (await api.send('login', playerLogin, browser)).cookie;
  assert.deepEqual(api.resolveUser(fresh), { id:'demo-player', name:'示例玩家', role:'player' });
  const revoked = (await manage('revoke-sessions')).data;
  assert.equal(revoked.status, 'active');
  assert.equal(revoked.activeSessions, 0);
  assert.equal(revoked.accountHistory[0].kind, 'revoke-sessions');
  assert.deepEqual((await manage('revoke-sessions')).data, revoked);
  assert.equal(api.resolveUser(fresh), null);
  assert.ok(api.resolveUser(admin));
  for (let i = 0; i < 16; i++) { await manage('disable'); await manage('restore'); }
  assert.equal((await api.staff('staff/users/demo-player')).data.accountHistory.length, 30);
});

test('管理员更换登录账号和密码后，旧凭据失效，重启后仍能打开原档案', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request': '1' };
  const change = { currentPassword: adminLogin.password, newPassword: 'Test-login-replacement', newLoginName: 'tester01' };
  const { cookie, data } = await api.send('login', adminLogin, browser);
  const player = await api.send('login', playerLogin, browser);
  assert.equal((await api.send('account/password', { ...change, currentPassword: playerLogin.password }, { ...browser, cookie: player.cookie })).status, 403);
  assert.equal((await api.send('account/password', { ...change, currentPassword: 'incorrect' }, { ...browser, cookie })).status, 400);
  assert.equal((await api.send('account/password', change, { ...browser, cookie })).status, 200);
  assert.equal(api.resolveUser(cookie), null);
  await api.restart();
  for (const credentials of [
    { email: adminLogin.email, password: change.newPassword },
    { email: change.newLoginName, password: adminLogin.password },
  ]) assert.equal((await api.send('login', credentials, browser)).status, 401);
  const updated = await api.send('login', { email: change.newLoginName, password: change.newPassword }, browser);
  assert.equal(updated.data.user.id, data.user.id);
  assert.equal(updated.data.user.role, 'admin');
  assert.equal(updated.data.user.loginName, change.newLoginName);
  assert.equal(updated.data.user.email, adminLogin.email);
});

test('本人改密须校验旧密码，成功后所有会话失效并清 cookie，本人资料提供邮箱', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request': '1' };
  const { cookie:phone } = await api.send('login', playerLogin, browser);
  const { cookie:laptop } = await api.send('login', playerLogin, browser);
  const credentials = { currentPassword:playerLogin.password, newPassword:'My-next-password-123' };
  const request = data => api.send('account/password', data, { ...browser, cookie:phone });
  assert.equal((await api.send('account/password', credentials, browser)).status, 401);
  assert.equal((await request({ ...credentials, currentPassword:'Incorrect-password' })).status, 400);
  assert.equal((await request({ ...credentials, newPassword:'123' })).status, 400);
  assert.equal((await request({ ...credentials, newPassword:playerLogin.password })).status, 400);
  assert.equal((await api.send('session', undefined, { cookie:phone })).data.user.email, playerLogin.email);
  const success = await request(credentials);
  assert.deepEqual(success.data, { ok:true });
  assert.match(success.setCookie, /Max-Age=0/);
  assert.equal(api.resolveUser(phone), null);
  assert.equal(api.resolveUser(laptop), null);
  await api.restart();
  assert.equal((await api.send('login', playerLogin, browser)).status, 401);
  const signedIn = await api.send('login', { email:playerLogin.email, password:credentials.newPassword }, browser);
  assert.equal(signedIn.data.user.email, playerLogin.email);
  assert.equal((await api.staff('staff/users/demo-player')).data.activeSessions, 1);
  assert.ok(!readFileSync(api.dataFile,'utf8').includes(credentials.newPassword));
});

test('旧版账号详情的操作不能撤销新登录的设备，改密和管理版本持久化', async t => {
  const api = await businessFixture(t);
  const path = 'staff/users/demo-player';
  const browser = { 'x-community-request': '1' };
  const act = (kind, actor, body) => api.send(path + '/' + kind, body, {
    'x-01-staff-secret': api.secret, 'x-01-staff-role':'owner', 'x-01-staff-id':actor,
  });
  const login = async (password = playerLogin.password) => (await api.send('login', { ...playerLogin, password }, browser)).cookie;
  const [first, second] = await Promise.all([api.staff(path), api.staff(path)]);
  assert.equal(first.data.accountRevision, 0);
  assert.equal(second.data.accountRevision, 0);
  const original = await login();
  assert.equal((await act('revoke-sessions', 'first', {expectedRevision:'0'})).status, 400);
  assert.ok(api.resolveUser(original));
  const revoked = await act('revoke-sessions', 'first', {expectedRevision:first.data.accountRevision, accountRevision:100});
  assert.equal(revoked.data.accountRevision, 1);
  assert.equal(api.resolveUser(original), null);
  const returning = await login();
  await api.restart();
  const stale = await act('revoke-sessions', 'second', {expectedRevision:second.data.accountRevision});
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /刷新用户详情/);
  assert.equal(api.resolveUser(returning).id, 'demo-player');
  const latest = (await api.staff(path)).data;
  assert.equal(latest.activeSessions, 1);
  assert.deepEqual(latest.accountHistory.map(row => row.actorId), ['first']);
  const disabled = await act('disable', 'second', {expectedRevision:latest.accountRevision});
  assert.equal(disabled.data.accountRevision, 2);
  assert.equal((await act('disable', 'second', {expectedRevision:2})).data.accountRevision, 2);
  // A client predating optimistic version checks can still restore the account.
  assert.equal((await act('restore', 'first', {})).data.accountRevision, 3);
  const fresh = await login();
  const nextPassword = 'Updated-for-this-test!';
  const changed = await api.send('account/password', { currentPassword:playerLogin.password, newPassword:nextPassword, accountRevision:500 },
    { ...browser, cookie:fresh });
  assert.equal(changed.status, 200);
  await api.restart();
  assert.equal((await api.staff(path)).data.accountRevision, 4);
  const afterPassword = await login(nextPassword);
  assert.equal((await act('disable','first',{expectedRevision:3})).status, 409);
  assert.ok(api.resolveUser(afterPassword));
});

test('另一标签页换号后，旧表单不能以新账号投稿、收藏、改密或退出', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request':'1' };
  const first = await api.send('login', playerLogin, { ...browser, 'x-community-account':'previous-account' });
  assert.equal(first.status, 200);
  const credentials = { name:'第二位玩家', email:'second@example.test', password:playerLogin.password };
  const oldForm = { ...browser, cookie:first.cookie, 'x-community-account':first.data.user.id };
  const second = await api.send('register', credentials, oldForm);
  assert.equal(second.status, 200);
  assert.equal(api.resolveUser(first.cookie), null);
  const switched = { ...oldForm, cookie:second.cookie };
  const actions = [
    ['projects', submission],
    ['edit/campus-agent', submission],
    ['recruitments', { eventId:'ai-build-sprint', projectId:'campus-agent', title:'组队', description:'一起创作', recruitment }],
    ['reaction/study-map', { kind:'save', active:true }],
    ['register-event', { eventId:'weekend-lab', name:'第一位玩家', contact:'first@example.test' }],
    ['account/password', { currentPassword:credentials.password, newPassword:'Wrong-target-change!' }],
    ['logout', {}],
  ];
  for (const [path, body] of actions) {
    const denied = await api.send(path, body, switched);
    assert.equal(denied.status, 401, path);
    assert.match(denied.data.error, /登录账号已变更/);
    assert.ok(!denied.setCookie);
  }
  assert.equal((await api.send('projects', submission, oldForm)).status, 401);
  assert.deepEqual((await api.send('mine', undefined, { cookie:second.cookie })).data, { projects:[], registrations:[], recruitments:[] });
  assert.equal((await api.send('projects/study-map', undefined, { cookie:second.cookie })).data.saved, false);
  const current = { ...switched, 'x-community-account':second.data.user.id };
  const submitted = await api.send('projects', submission, current);
  assert.equal(submitted.data.ownerId, second.data.user.id);
  assert.equal((await api.send('logout', {}, current)).status, 200);
  assert.equal((await api.send('login', credentials, browser)).status, 200);

  const anonymous = { 'x-community-account':'anonymous' };
  const entered = await api.send('events/weekend-lab/registrations',
    {name:'官网玩家',contact:'anon@example.test',idempotencyKey:'unrelated-account-header-01'}, anonymous);
  assert.equal(entered.status, 200);
  const receipt = await api.send('registration-status', {id:entered.data.id, receiptToken:entered.data.receiptToken}, anonymous);
  assert.equal(receipt.data.status, 'approved');
});

test('请求地址仅从生产回环代理读取单一有效 IP，其余使用连接对端', () => {
  const address = (peer, real, secure = true) =>
    clientAddress({ socket:{remoteAddress:peer}, headers:{'x-real-ip':real} }, secure);
  assert.equal(address('127.0.0.1', '192.0.2.10'), '192.0.2.10');
  assert.equal(address('::1', '2001:db8::10'), '2001:db8::10');
  assert.equal(address('::ffff:127.0.0.1', '192.0.2.11'), '192.0.2.11');
  assert.equal(address('192.0.2.20', '192.0.2.10'), '192.0.2.20');
  assert.equal(address('127.0.0.1', '192.0.2.10', false), '127.0.0.1');
  assert.equal(address('::1', 'not-an-address'), '::1');
});

test('代理后成功登录不消耗配额，失败计数按客户端与账号分开，正常登录仅清除自己的连续失败', async t => {
  const api = await businessFixture(t, { secure:true });
  const local = { 'x-community-request':'1', 'x-real-ip':'192.0.2.10' };
  const other = { ...local, 'x-real-ip':'192.0.2.11' };
  const signIn = (credentials, headers = local) => api.send('login', credentials, headers);
  for (let i = 0; i < 24; i++) assert.equal((await signIn(playerLogin)).status, 200);
  const wrong = { ...playerLogin, password:'Incorrect-test-password' };
  for (let i = 0; i < 19; i++) assert.equal((await signIn(wrong)).status, 401);
  assert.equal((await signIn(playerLogin)).status, 200);
  for (let i = 0; i < 19; i++) assert.equal((await signIn(wrong)).status, 401);
  assert.equal((await signIn(adminLogin)).status, 200);
  assert.equal((await signIn(wrong)).status, 401);
  assert.equal((await signIn(playerLogin)).status, 429);
  assert.equal((await signIn(playerLogin, other)).status, 200);
  assert.equal((await signIn(adminLogin)).status, 200);
  assert.equal((await signIn(playerLogin)).status, 429);
  t.mock.timers.tick(600000);
  assert.equal((await signIn(playerLogin)).status, 200);
});

test('注册配额只计算同一客户端新建成功的账号，不占用登录或匿名报名配额', async t => {
  const api = await businessFixture(t, { secure:true });
  const local = { 'x-community-request':'1', 'x-real-ip':'192.0.2.10' };
  const other = { ...local, 'x-real-ip':'192.0.2.11' };
  const create = (n, headers = local) => api.send('register', {name:'测试成员',email:'quota-' + n + '@example.test',password:'Registration-test-123'}, headers);
  assert.equal((await api.send('register', { ...playerLogin, name:'现有玩家' }, local)).status, 409);
  for (let i = 0; i < 20; i++) assert.equal((await create(i)).status, 200);
  assert.equal((await create(20)).status, 429);
  assert.equal((await api.send('login', playerLogin, local)).status, 200);
  assert.equal((await create(20, other)).status, 200);
  assert.equal((await api.send('events/weekend-lab/registrations',
    { name:'匿名报名', contact:'new@example.test', idempotencyKey:'quota-independent-12345' }, local)).status, 200);
  t.mock.timers.tick(600000);
  assert.equal((await create(21)).status, 200);
});

test('同时注册和两个设备登录不会互相覆盖，重复邮箱只占一个账号', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request': '1' };
  const registration = name => ({ name, email: name + '@example.test', password: 'Shared-test-password!' });
  const a = registration('alice'), b = registration('bob');
  const results = await Promise.all([a, a, b].map(data => api.send('register', data, browser)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 409]);
  const logins = await Promise.all([a, a].map(data => api.send('login', data, browser)));
  const receipts = [...results.filter(r => r.status === 200), ...logins];
  await api.restart();
  for (const receipt of receipts) assert.equal(api.resolveUser(receipt.cookie)?.id, receipt.data.user.id);
  const storage = JSON.parse(readFileSync(api.dataFile, 'utf8'));
  assert.equal(storage.sessions.length, 4);
  assert.equal(storage.users.filter(user => user.email === a.email).length, 1);
});

test('凭据计算期间仍可处理业务；改密与账号状态提交按最新会话和版本校验', async t => {
  let barrier;
  function holdNext() {
    const pending = { ready: signal(), release: signal() };
    barrier = pending;
    return pending;
  }
  const api = await businessFixture(t, { passwordQueue: async work => {
    const pause = barrier;
    barrier = undefined;
    const value = await runPasswordWork(work);
    if (pause) {
      pause.ready.resolve();
      await pause.release.promise;
    }
    return value;
  } });
  const browser = { 'x-community-request': '1' };
  const signedIn = await api.send('login', playerLogin, browser);
  const headers = { ...browser, cookie: signedIn.cookie };
  const passwordChange = newPassword => api.send('account/password', { currentPassword: playerLogin.password, newPassword }, headers);
  const first = holdNext();
  const pendingChange = passwordChange('Draft-password-first!');
  try {
    await first.ready.promise;
    assert.equal((await api.send('session', undefined, headers)).data.user.id, 'demo-player');
    assert.equal((await passwordChange('Confirmed-password-second!')).status, 200);
  } finally { first.release.resolve(); }
  assert.equal((await pendingChange).status, 401);
  assert.equal(api.resolveUser(signedIn.cookie), null);

  const updated = { ...playerLogin, password: 'Confirmed-password-second!' };
  assert.equal((await api.send('login', updated, browser)).status, 200);
  const second = holdNext();
  const pendingLogin = api.send('login', updated, browser);
  try {
    await second.ready.promise;
    assert.equal((await api.staff('staff/users/demo-player/disable', {}, 'owner')).status, 200);
    assert.equal((await api.staff('staff/users/demo-player/restore', {}, 'owner')).status, 200);
  } finally { second.release.resolve(); }
  assert.equal((await pendingLogin).status, 409);
  assert.equal((await api.staff('staff/users/demo-player')).data.activeSessions, 0);
  assert.equal((await api.send('login', updated, browser)).status, 200);
});

test('密码任务按顺序让出工作槽位，队列已满时返回可重试响应，读取仍可用', async t => {
  const queue = createPasswordQueue({ concurrency: 1, maxWaiting: 1 });
  const busy = signal(), release = signal(), queued = signal();
  let ordinal = 0;
  const api = await businessFixture(t, { passwordQueue: work => {
    const order = ++ordinal;
    if (order === 2) queued.resolve();
    return queue(async () => {
      if (order === 1) {
        busy.resolve();
        await release.promise;
      }
      return work();
    });
  } });
  const browser = { 'x-community-request': '1' };
  const login = () => api.send('login', playerLogin, browser);
  const first = login();
  let second;
  try {
    await busy.promise;
    second = login();
    await queued.promise;
    assert.equal((await api.send('health')).status, 200);
    const response = await login();
    assert.equal(response.status, 503);
    assert.equal(response.retryAfter, '1');
    assert.equal(response.cookie, undefined);
  } finally { release.resolve(); }
  assert.deepEqual((await Promise.all([first, second])).map(r => r.status), [200, 200]);
  assert.equal((await login()).status, 200);
});

test('未登录、角色无权限和不属于本人的写请求在复制业务库之前返回', async t => {
  const api = await businessFixture(t);
  const browser = { 'x-community-request': '1' };
  const { cookie } = await api.send('login', playerLogin, browser);
  const signed = { ...browser, cookie };
  const originalClone = globalThis.structuredClone;
  let copies = 0;
  t.mock.method(globalThis, 'structuredClone', (value, options) => {
    if (value?.instanceId && Array.isArray(value.users)) copies++;
    return originalClone(value, options);
  });
  assert.equal((await api.send('projects', submission, browser)).status, 401);
  assert.equal((await api.send('photos', {}, signed)).status, 403);
  assert.equal((await api.send('edit/study-map', submission, signed)).status, 403);
  assert.equal((await api.staff('staff/users/demo-player/disable', {}, 'operator')).status, 403);
  assert.equal((await api.send('staff/events', {}, signed)).status, 403);
  assert.equal((await api.send('logout', {}, browser)).status, 200);
  assert.equal(copies, 0);
  const submitted = await api.send('projects', submission, signed);
  assert.equal(submitted.status, 200);
  assert.ok((await api.send('mine', undefined, signed)).data.projects.some(p => p.id === submitted.data.id));
  assert.equal(copies, 0);
});

test('活动报名入口在官网和外链间切换，草稿隔离、关闭本站收集并保留原票根', async t => {
  const {client}=await fixture(t), admin=client(), visitor=client(), player=client();
  await admin('login',adminLogin); await player('login',playerLogin);
  const input={id:'external-entry',name:'外部赛事',description:'通过主办方报名。',date:'2026.12.10',status:'open',registrationDestination:'external',registrationUrl:'https://example.test/enroll?event=01'};
  const draft=await admin('staff/events',input);
  assert.equal(draft.registrationDestination,'external');
  await admin('staff/events/'+draft.id+'/publish',{draftRevision:draft.draftRevision});
  let event=await visitor('events/'+draft.id);
  assert.equal(event.registrationUrl,input.registrationUrl);assert.equal(event.registrationOpen,true);
  const body={name:'玩家',contact:'external@example.test',answers:{},idempotencyKey:'external-entry-test-key'};
  await visitor('events/'+draft.id+'/registrations',body,409);
  await player('register-event',{...body,eventId:draft.id},409);
  const internal=await admin('staff/events/'+draft.id,{registrationDestination:'website'});
  assert.equal((await visitor('events/'+draft.id)).registrationDestination,'external');
  await admin('staff/events/'+draft.id+'/publish',{draftRevision:internal.draftRevision});
  event=await visitor('events/'+draft.id);assert.equal(event.registrationDestination,'website');assert.equal(event.registrationUrl,'');
  const receipt=await visitor('events/'+draft.id+'/registrations',body);assert.ok(receipt.id);
  const switched=await admin('staff/events/'+draft.id,{registrationDestination:'external',registrationUrl:input.registrationUrl});
  await admin('staff/events/'+draft.id+'/publish',{draftRevision:switched.draftRevision});
  assert.equal((await visitor('events/'+draft.id+'/registrations',body)).id,receipt.id);
  await admin('staff/events',{...input,id:'unsafe-entry',registrationUrl:'javascript:alert(1)'},400);
  await admin('staff/events',{...input,id:'credential-entry',registrationUrl:'https://a:b@example.test'},400);
  const incomplete=await admin('staff/events',{...input,id:'empty-entry',registrationUrl:''});
  await admin('staff/events/'+incomplete.id+'/publish',{draftRevision:incomplete.draftRevision},400);
  assert.equal((await visitor('events/weekend-lab')).registrationDestination,'website');
});
test('报名中及进行中均可组队招募，结束和下架后禁止新增招募',async t=>{
 const {client}=await fixture(t), player=client(),admin=client();await player('login',playerLogin);await admin('login',adminLogin);
 const body={eventId:'weekend-lab',projectId:'campus-agent',title:'报名期寻找伙伴',description:'准备一起参加活动',recruitment};
 const created=await player('recruitments',body);assert.equal(created.eventId,'weekend-lab');
 assert.ok((await player('recruitments?event=weekend-lab')).some(row=>row.id===created.id));
 await player('recruitments',{...body,eventId:'ai-build-sprint'});
 await player('recruitments',{...body,eventId:'autumn-hack'},409);
 await admin('staff/events/weekend-lab/archive',{});
 await player('recruitments',body,404);
});


test('进行中的官网报名遵守截止时间，招募带项目名称且简介最多三十字', async t=>{
 const {client}=await fixture(t),admin=client(),visitor=client(),player=client();await admin('login',adminLogin);await player('login',playerLogin);
 const record=await admin('staff/events',{id:'active-signup',name:'进行中报名',description:'进行中也能参与。',status:'active',date:'2026.11.20 — 11.30',registrationClosesAt:'2026-11-23T12:00:00Z'});
 await admin('staff/events/'+record.id+'/publish',{draftRevision:record.draftRevision});
 assert.equal((await visitor('events/'+record.id)).registrationOpen,true);
 const body={name:'参与者',contact:'active@example.test',answers:{},idempotencyKey:'active-signup-test-key'};
 assert.ok((await visitor('events/'+record.id+'/registrations',body)).id);
 const closed=await admin('staff/events/'+record.id,{registrationClosesAt:'2026-11-21T12:00:00Z'});
 await admin('staff/events/'+record.id+'/publish',{draftRevision:closed.draftRevision});
 assert.equal((await visitor('events/'+record.id)).registrationOpen,false);
 await visitor('events/'+record.id+'/registrations',{...body,contact:'late@example.test',idempotencyKey:'active-signup-late-key'},409);
 const team={eventId:record.id,projectId:'campus-agent',title:'招募标题',description:'字'.repeat(30),recruitment};
 const saved=await player('recruitments',team);
 const view=(await visitor('recruitments?event='+record.id)).find(item=>item.id===saved.id);
 assert.equal(view.projectName,(await player('projects/campus-agent')).name);
 assert.equal(view.description.length,30);
 await player('recruitments',{...team,description:'字'.repeat(31)},400);
});

test('报名分别保存电话与微信，电话判重、重试及隐私保持一致', async t=>{
 const {client}=await fixture(t),admin=client(),visitor=client(),player=client();await admin('login',adminLogin);await player('login',playerLogin);
 const body={name:'电话报名玩家',phone:'138 0000 0000',wechat:'player_wechat',answers:{},idempotencyKey:'phone-wechat-test-key'};
 const receipt=await player('events/weekend-lab/registrations',body);
 assert.equal((await player('events/weekend-lab/registrations',body)).id,receipt.id);
 const mine=(await player('mine')).registrations.find(row=>row.id===receipt.id);
 assert.equal(mine.phone,'13800000000');assert.equal(mine.wechat,'player_wechat');
 const row=(await admin('registrations')).find(row=>row.id===receipt.id);assert.equal(row.contact,mine.phone);assert.equal(row.phone,mine.phone);
 assert.ok(!JSON.stringify(await visitor('events')).includes(body.wechat));
 const publicReceipt=await visitor('registration-status',{id:receipt.id,receiptToken:receipt.receiptToken});
 assert.ok(!Object.hasOwn(publicReceipt,'phone'));assert.ok(!Object.hasOwn(publicReceipt,'wechat'));
 await visitor('events/weekend-lab/registrations',{...body,phone:'138-0000-0000',idempotencyKey:'phone-wechat-duplicate-key'},409);
 await visitor('events/weekend-lab/registrations',{...body,phone:'not-a-phone',idempotencyKey:'phone-wechat-invalid-key'},400);
 await player('events/weekend-lab/registrations',{...body,wechat:'changed_wechat'},409);
});

test('公开主页展示昵称头像和大学，不披露账号与报名资料', async t=>{
 const {client}=await fixture(t),visitor=client(),player=client(),admin=client();
 const user=(await player('login',playerLogin)).user;await admin('login',adminLogin);
 const pending=await player('projects',{...submission,name:'尚未公开的作品',description:'私人审核中的正文。'});
 await player('account/profile',{name:'公开主页玩家',university:'公开主页大学',publicContact:'微信：公开联系号'});
 await player('events/weekend-lab/registrations',{name:'报名姓名',phone:'13898765432',wechat:'private_wechat',answers:{},idempotencyKey:'profile-private-registration-key'});
 const team=await player('recruitments',{eventId:'ai-build-sprint',projectId:pending.id,title:'寻找伙伴',description:'一起完成实用项目',recruitment});
 let profile=await visitor('profiles/'+user.id);
 assert.deepEqual(Object.keys(profile).sort(),['avatar','id','name','projects','publicContact','recruitments','university']);
 assert.equal(profile.name,'公开主页玩家');assert.ok(!profile.projects.some(project=>project.id===pending.id));
 assert.ok(profile.recruitments.some(row=>row.id===team.id));
 const serialized=JSON.stringify(profile);for(const value of [playerLogin.email,'13898765432','private_wechat','私人审核中的正文。'])assert.ok(!serialized.includes(value));
 assert.equal(profile.university,'公开主页大学');assert.equal(profile.publicContact,'微信：公开联系号');assert.equal(profile.avatar,'');assert.ok(!Object.hasOwn(profile,'registrations'));
 await admin('review/'+pending.id,{status:'approved'});profile=await visitor('profiles/'+user.id);
 assert.ok(profile.projects.some(project=>project.id===pending.id));
 const newcomer=client();const newUser=(await newcomer('register',{email:'no-public-profile@example.test',password:'Safe-Test-12345',name:'未公开玩家'})).user;
 await visitor('profiles/'+newUser.id,undefined,404);await visitor('profiles/unknown-player',undefined,404);
});

test('项目收藏数随不同玩家的收藏和取消更新，重复收藏不重复计数',async t=>{
 const {client}=await fixture(t),player=client(),admin=client(),visitor=client();await player('login',playerLogin);await admin('login',adminLogin);
 const path='reaction/study-map',body={kind:'save',active:true};
 assert.equal((await visitor('projects/study-map')).saves,0);
 assert.equal((await player(path,body)).saves,1);assert.equal((await player(path,body)).saves,1);
 assert.equal((await admin(path,body)).saves,2);
 const publicView=await visitor('projects/study-map');assert.equal(publicView.saves,2);assert.equal(publicView.saved,false);
 assert.equal((await player(path,{kind:'save',active:false})).saves,1);
});

test('后台录入作品的署名可打开公开作者页，无需暴露后台账号',async t=>{
 const {client}=await fixture(t),admin=client(),visitor=client();await admin('login',adminLogin);
 const project=await admin('staff/projects',{...submission,id:crypto.randomUUID(),name:'后台录入作品',author:'公开署名作者'});
 await admin('review/'+project.id,{status:'approved'});
 const profile=await visitor('profiles/project-'+project.id);
 assert.equal(profile.name,'公开署名作者');assert.equal(profile.projects[0].id,project.id);
 assert.ok(!JSON.stringify(profile).includes(adminLogin.email));assert.ok(!Object.hasOwn(profile,'email'));
});

test('合作活动可通过后台发布，公开卡片、报名、投稿和相册保留合作分类',async t=>{
 const {client}=await fixture(t),admin=client(),player=client(),visitor=client();await admin('login',adminLogin);await player('login',playerLogin);
 const draft=await admin('staff/events',{id:'co-create-category',name:'合作类型验收',type:'合作',category:'activity',description:'面向玩家的合作活动。',date:'2035.12.01',status:'active',submissionsOpen:true});
 await admin('staff/events/'+draft.id+'/publish',{draftRevision:draft.draftRevision});
 const event=await visitor('events/'+draft.id);assert.equal(event.category,'activity');assert.equal(event.type,'合作');
 assert.equal((await visitor('events?view=card')).find(row=>row.id===draft.id).category,'activity');
 assert.equal((await visitor('albums')).find(row=>row.eventId===draft.id).category,'activity');
 const project=await player('projects',{...submission,eventId:draft.id});assert.equal(project.eventId,draft.id);
 const receipt=await visitor('events/'+draft.id+'/registrations',{name:'合作参加者',phone:'13812121212',wechat:'',answers:{},idempotencyKey:'co-create-category-signup-key'});assert.ok(receipt.id);
 const changed=await admin('staff/events/'+draft.id,{category:'salon',type:'沙龙'});
 assert.equal((await visitor('events/'+draft.id)).category,'activity');
 await admin('staff/events/'+draft.id+'/publish',{draftRevision:changed.draftRevision});assert.equal((await visitor('events/'+draft.id)).category,'salon');
 await admin('staff/events',{id:'invalid-co-create-type',name:'类型无效',description:'验证类型',date:'2035.12.01',category:'unsupported'},400);
});


test('项目简介限制20字，作品展示图限制2张，图片分工独立保存',async t=>{
 const {client}=await fixture(t), player=client();await player('login',playerLogin);
 await player('projects',{...submission,summary:'字'.repeat(21)},400);
 await player('projects',{...submission,showcaseImages:['https://example.test/1.jpg','https://example.test/2.jpg','https://example.test/3.jpg']},400);
 await player('projects',{...submission,imageUrl:42},400);
 const images=['https://example.test/1.jpg','https://example.test/2.jpg'];
 const result=await player('projects',{...submission,imageUrl:'https://example.test/card.jpg',bannerUrl:'https://example.test/banner.jpg',showcaseImages:images});
 assert.equal(result.imageUrl,'https://example.test/card.jpg');assert.equal(result.bannerUrl,'https://example.test/banner.jpg');assert.deepEqual(result.showcaseImages,images);
 const edited=await player('edit/'+result.id,{...result,summary:'修改后的项目简介'});
 assert.deepEqual(edited.showcaseImages,images);assert.equal(edited.bannerUrl,result.bannerUrl);
});


test('团建照片可通过运营添加并保留活动关联',async t=>{
 const {client}=await fixture(t),admin=client(),visitor=client();await admin('login',adminLogin);
 const photo=await admin('photos',{eventId:'ai-build-sprint',title:'玩家团建',imageUrl:'https://example.test/team.jpg',category:'team-building'});
 const album=(await visitor('albums')).find(album=>album.eventId==='ai-build-sprint');
 assert.equal(album.photos.find(row=>row.id===photo.id).category,'team-building');
});


test('投稿和修改必须有封面与横幅，项目链接可留空',async t=>{
 const {client}=await fixture(t),player=client();await player('login',playerLogin);
 await player('projects',{...submission,imageUrl:''},400);
 await player('projects',{...submission,bannerUrl:''},400);
 await player('projects',{...submission,imageUrl:'   '},400);
 const created=await player('projects',{...submission,demoUrl:''});assert.equal(created.demoUrl,'');
 await player('edit/'+created.id,{...created,imageUrl:''},400);
 await player('edit/'+created.id,{...created,bannerUrl:''},400);
 const updated=await player('edit/'+created.id,{...created,demoUrl:'https://example.test/live'});assert.equal(updated.demoUrl,'https://example.test/live');
});


test('选填公开联系方式可保存、沿用和清空，不从报名资料自动填入',async t=>{
 const {client}=await fixture(t),player=client(),visitor=client();const {user}=await player('login',playerLogin);
 assert.equal((await visitor('profiles/'+user.id)).publicContact,'');
 let saved=await player('account/profile',{name:user.name,university:'测试大学',publicContact:'  微信：contact_demo  '});
 assert.equal(saved.user.publicContact,'微信：contact_demo');
 assert.equal((await visitor('profiles/'+user.id)).publicContact,'微信：contact_demo');
 saved=await player('account/profile',{name:user.name,university:'测试大学'});assert.equal(saved.user.publicContact,'微信：contact_demo');
 await player('account/profile',{name:user.name,publicContact:'字'.repeat(201)},400);
 await player('account/profile',{name:user.name,publicContact:123},400);
 saved=await player('account/profile',{name:user.name,university:'测试大学',publicContact:''});
 assert.equal(saved.user.publicContact,undefined);assert.equal((await visitor('profiles/'+user.id)).publicContact,'');
});
