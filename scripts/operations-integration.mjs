import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { checkOperationsSite } from '../deploy/operations/smoke.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'cms');
const token = () => randomBytes(32).toString('hex');
const children = new Set();
let temp;
function command(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio:['ignore','pipe','pipe'], detached: process.platform !== 'win32' });
  let logs = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk.toString()).slice(-15000); });
  const finished = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
  children.add(child);
  finished.finally(() => children.delete(child));
  return { child, finished, output: () => logs };
}
async function checked(args, cwd, env) {
  const p = command(args, cwd, env);
  const result = await p.finished;
  if (result.code !== 0) throw Error('集成测试依赖的命令失败。' + '\n' + p.output());
}
async function port() {
  const sock = createServer(); sock.listen(0, '127.0.0.1'); await once(sock, 'listening');
  const value = sock.address().port; await new Promise(resolve => sock.close(resolve)); return value;
}
async function awaitServer(url, proc, accept = r => r.status < 500) {
  const end = Date.now() + 90000;
  while (Date.now() < end && proc.child.exitCode === null && proc.child.signalCode === null) {
    try { const response = await fetch(url, { signal:AbortSignal.timeout(3500) }); await response.body?.cancel(); if (accept(response)) return; }
    catch { /* Wait for the fresh process to bind and initialize. */ }
    await delay(300);
  }
  throw Error('测试服务未就绪。' + '\n' + proc.output());
}
function stop(child, signal = 'SIGTERM') {
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (e) { if (e.code !== 'ESRCH') throw e; }
}
async function cleanup() {
  const active = [...children];
  await Promise.all(active.map(async child => {
    const done = once(child, 'exit'); stop(child);
    await Promise.race([done,delay(3000, null, {ref:false})]);
    if (child.exitCode === null && child.signalCode === null) { stop(child,'SIGKILL'); await done; }
  }));
  if (temp) await rm(temp, { recursive:true, force:true });
}
async function request(url, {method = 'GET', body, auth, status = 200, staff = false, cookie, captureCookie = false, communityWrite = false} = {}) {
  const multipart = body instanceof FormData;
  const headers = { ...(auth ? {Authorization:'JWT ' + auth} : {}), ...(body && !multipart ? {'Content-Type':'application/json'} : {}), ...(staff ? {'x-01-desk':'1'} : {}) };
  if (cookie) headers.Cookie = cookie;
  if (communityWrite) headers['x-community-request'] = '1';
  const response = await fetch(url, { method, headers, body: body == null ? undefined : multipart ? body : JSON.stringify(body), signal:AbortSignal.timeout(20000), redirect:'manual' });
  const json = response.headers.get('content-type')?.includes('json');
  const data = json ? await response.json() : Buffer.from(await response.arrayBuffer());
  assert.ok([status].flat().includes(response.status), method + ' ' + new URL(url).pathname + ' returned ' + response.status + ' (expected ' + status + ')' + (data?.errors ? ' ' + data.errors.map(e => e.message).join(' / ') : ''));
  return captureCookie ? { data, cookie: response.headers.getSetCookie()[0]?.split(';')[0] } : data;
}

async function verifyCommunityUsers({ community, endpoint, desk, owner, operator, admin, site }) {
  const email = 'registered-' + randomUUID() + '@example.test', password = token();
  const sign = (path, body, options) => community(path, {method:'POST',communityWrite:true,body,...options});
  const created = await sign('register',{email,password,name:'官网联调玩家'},{captureCookie:true});
  const id = created.data.user.id, path = 'staff/users/' + id;
  assert.ok(created.cookie && id);
  const browserTwo = await sign('login',{email,password},{captureCookie:true});
  const list = await desk('staff/users','GET',undefined,{q:email,status:'active',page:'1',pageSize:'5'});
  assert.equal(list.total,1);
  assert.equal(list.items[0].id,id);
  assert.equal(list.items[0].activeSessions,2);
  assert.ok(list.items[0].createdAt && list.items[0].lastLoginAt);
  const project = await sign('projects',{name:'账号关联作品',summary:'审核用户关联',description:'按作者账号 ID 找回官网用户。',demoUrl:'https://example.test/demo',imageUrl:'https://example.test/cover.jpg',bannerUrl:'https://example.test/banner.jpg'},{cookie:created.cookie});
  assert.ok((await desk('staff/projects')).some(p=>p.id===project.id && p.accountId===id));
  assert.equal((await endpoint('work-queue',{auth:operator})).projects,1);
  await desk('staff/projects/'+project.id+'/review','POST',{status:'approved'});
  assert.equal((await endpoint('work-queue',{auth:operator})).projects,0);
  assert.equal((await desk(path)).projectCount,1);
  for (const kind of ['save', 'like']) {
    await sign('reaction/' + project.id, { kind, active: true }, { cookie: created.cookie });
  }
  const activityEvent = 'account-activity';
  await desk('staff/events', 'POST', {
    id: activityEvent, name: '账号联调活动', description: '验证玩家活动记录。',
    date: (new Date().getUTCFullYear() + 1) + '.12.01', registrationMode: 'direct',
  });
  await desk('staff/events/' + activityEvent + '/publish', 'POST', {});
  const registration = await sign('register-event', {
    eventId: activityEvent, name: '官网联调玩家', contact: 'activity@example.test',
  }, { cookie: created.cookie });
  const activityPath = path + '/activity';
  await endpoint('desk', { method: 'POST', staff: true, cookie: created.cookie, status: 403,
    body: { path: activityPath, method: 'GET', query: { kind: 'saved' } } });
  for (const kind of ['projects', 'saved', 'liked']) {
    const result = await desk(activityPath, 'GET', undefined, { kind, page: '99' });
    assert.equal(result.page, 1);
    assert.equal(result.total, 1);
    assert.deepEqual(result.items.map(item => item.id), [project.id]);
  }
  const bookings = await desk(activityPath, 'GET', undefined, { kind: 'registrations' });
  assert.deepEqual(bookings.items.map(item => item.id), [registration.id]);
  assert.equal(bookings.items[0].title, '账号联调活动');
  assert.ok(!Object.hasOwn(bookings.items[0], 'contact') && !Object.hasOwn(bookings.items[0], 'answers'));
  await endpoint('desk',{method:'POST',cookie:created.cookie,staff:true,body:{path:'staff/users',method:'GET'},status:403});
  const action = (role,kind,status=200) => endpoint('desk',{method:'POST',auth:role,staff:true,status,body:{path:path+'/'+kind,method:'POST',data:{}}});
  for (const kind of ['disable','restore','revoke-sessions']) await action(operator,kind,403);
  const disabled = await action(owner,'disable');
  assert.equal(disabled.status,'disabled');assert.equal(disabled.activeSessions,0);
  assert.equal((await desk('staff/users','GET',undefined,{q:email,status:'disabled'})).total,1);
  for (const session of [created,browserTwo]) assert.equal((await community('session',{cookie:session.cookie})).user,null);
  await sign('login',{email,password},{status:403});
  await action(owner,'restore');
  assert.equal((await community('session',{cookie:created.cookie})).user,null);
  const again = await sign('login',{email,password},{captureCookie:true});
  await action(owner,'revoke-sessions');
  assert.equal((await community('session',{cookie:again.cookie})).user,null);
  const detail=await desk(path);
  assert.equal(detail.projectCount,1);
  assert.equal(detail.registrationCount,1);
  assert.equal(detail.savedCount,1);
  assert.equal(detail.likedCount,1);
  assert.deepEqual(detail.accountHistory.map(record=>record.kind),['revoke-sessions','restore','disable']);
  const actor=(await endpoint('staff/me',{auth:owner})).user;
  assert.ok(detail.accountHistory.every(record=>String(record.actorId)===String(actor.id)));
  assert.ok(!JSON.stringify(detail).includes(password) && !('password' in detail) && !('sessions' in detail));
  await endpoint('player-directory',{status:403});
  await endpoint('player-directory',{cookie:created.cookie,status:403});
  const directory = await endpoint('player-directory',{auth:owner});
  assert.ok(directory.items.some(account => account.id === id && account.role === 'player' && account.identity === 'player'));
  assert.ok(directory.items.some(account => account.email === actor.email && account.identity === 'head' && account.source === 'staff'));
  assert.ok(directory.items.every(account => !('password' in account) && !('sessions' in account)));
  const heads = await endpoint('player-directory?role=head', { auth: owner });
  assert.ok(heads.items.some(account => account.email === actor.email));
  assert.ok(heads.items.every(account => account.identity === 'head'));
  const pioneers = await endpoint('player-directory?role=pioneer', { auth: owner });
  assert.ok(pioneers.items.length > 0);
  assert.ok(pioneers.items.every(account => account.identity === 'pioneer' && account.source === 'staff'));
  const players = await endpoint('player-directory?role=player', { auth: owner });
  assert.ok(players.items.some(account => account.id === id));
  assert.ok(players.items.every(account => account.identity === 'player' && account.source === 'community'));
  const matchedHead = await endpoint('player-directory?role=head&q=' + encodeURIComponent(actor.email), { auth: owner });
  assert.deepEqual(matchedHead.items.map(account => account.email), [actor.email]);
  const operatorAccount = (await endpoint('staff/me', { auth: operator })).user;
  await endpoint('staff/' + operatorAccount.id, { method: 'PATCH', auth: operator, body: { role: 'owner' }, status: 403 });
  await endpoint('staff/' + actor.id, { method: 'PATCH', auth: owner, body: { role: 'operator' }, status: 400 });
  const administrators = await endpoint('player-directory?role=admin',{auth:operator});
  assert.ok(administrators.items.every(account => account.role === 'admin' && account.email !== actor.email));
  assert.ok(administrators.items.some(account => account.source === 'staff'));
  if (process.env.OPERATIONS_BROWSER === '1') {
    const { verifyUserDirectory } = await import('./verify-user-directory-browser.mjs');
    await verifyUserDirectory({ admin, site, owner, operator, email, password, id });
  }
}

async function run() {
  if (!existsSync(join(source,'node_modules/next/dist/bin/next'))) throw Error('请先执行 npm --prefix cms ci。');
  if (!existsSync(join(root,'dist/index.html'))) throw Error('请先执行 npm run build，生成官网发布文件。');
  temp = await mkdtemp(join(tmpdir(),'01player-operations-test-'));
  const cms = join(temp,'cms'), data = join(temp,'runtime');
  await mkdir(cms); await mkdir(data);
  for (const name of ['src','package.json','tsconfig.json','next.config.mjs']) await cp(join(source,name), join(cms,name), {recursive:true});
  await symlink(join(source,'node_modules'), join(cms,'node_modules'), 'dir');
  // Compile the CMS against the same website components and dependencies as a release build.
  const websiteBuildInputs = ['src','public','server','node_modules','deliverables'];
  for (const input of ['src','public','server']) await cp(join(root,input), join(temp,input), { recursive:true });
  await symlink(join(root,'node_modules'), join(temp,'node_modules'), 'dir');
  await mkdir(join(temp,'deliverables'));
  await symlink(join(root,'deliverables','品牌素材'), join(temp,'deliverables','品牌素材'), 'dir');
  const sitePort = await port(), cmsPort = await port(), previewPort = await port();
  const site = 'http://127.0.0.1:' + sitePort, admin = 'http://127.0.0.1:' + cmsPort;
  const email = 'owner-' + randomUUID() + '@example.test', password = token();
  const env = { PATH:process.env.PATH, HOME:temp, TMPDIR:temp, CI:'1', NEXT_TELEMETRY_DISABLED:'1', NODE_ENV:'production',
    PAYLOAD_SECRET:token(), COMMUNITY_STAFF_BRIDGE_SECRET:token(), CMS_OWNER_EMAIL:email, CMS_OWNER_PASSWORD:password,
    CLUB_CMS_DATA:data, COMMUNITY_DATA_FILE:join(temp,'events.json'), COMMUNITY_ADMIN_EMAIL:'local-admin@example.test', COMMUNITY_ADMIN_PASSWORD:token(),
    COMMUNITY_INTERNAL_ORIGIN:site, CMS_INTERNAL_ORIGIN:admin, OPS_MONITORING_ENABLED:'0', HOST:'127.0.0.1' };
  const payload = join(cms,'node_modules/payload/bin.js'), next = join(cms,'node_modules/next/dist/bin/next');
  console.log('迁移独立 SQLite 数据库并构建运营台…');
  await checked([payload, 'migrate'], cms, env);
  await checked([payload, 'generate:importmap'], cms, env);
  await checked([next, 'build', '--webpack'], cms, env);
  // Match the production runtime: keep the shared identity module, without frontend build dependencies.
  for (const input of websiteBuildInputs) await rm(join(temp,input), { recursive:true });
  await mkdir(join(temp,'src/community/account'), { recursive:true });
  await cp(join(root,'src/community/account/identity.js'), join(temp,'src/community/account/identity.js'));
  await mkdir(join(temp,'server'), { recursive:true });
  await cp(join(root,'server/guide-content.mjs'), join(temp,'server/guide-content.mjs'));
  await checked([payload, 'migrate'], cms, env);
  // Browser writes use HTTP on this loopback fixture; production terminates HTTPS at NGINX.
  const server = command([join(root,'server/start.mjs')], root, {...env, NODE_ENV:'test', PORT:String(sitePort)});
  const cmsServer = command([next,'start','-H','127.0.0.1','-p',String(cmsPort)], cms, env);
  await Promise.all([awaitServer(site+'/api/community/health',server,r=>r.status===200), awaitServer(admin+'/cms-api/staff/me',cmsServer)]);
  const previewOrigin = 'http://127.0.0.1:' + previewPort;
  const preview = command([join(root,'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], root,
    {...env,NODE_ENV:'test',PLAYER_ORIGIN:site,COMMUNITY_DATA_FILE:join(temp,'preview-events.json')});
  await awaitServer(previewOrigin+'/site-content/manifest.json',preview,r=>r.status===200);
  const endpoint = (path, args) => request(admin+'/cms-api/'+path,args);
  const community = (path,args) => request(site+'/api/community/'+path,args);
  const published = () => request(site+'/site-content/manifest.json');
  try {
    await checkOperationsSite(previewOrigin);
    console.log('核验登录、运营权限与只读运维看板…');
    const auth = (await endpoint('staff/login',{method:'POST',body:{email,password}})).token;
    assert.ok(auth);
    const operatorEmail = 'operator-' + randomUUID() + '@example.test', operatorPassword = token();
    const temporaryPassword = token();
    const staffRecord = await endpoint('staff',{method:'POST',auth,body:{email:operatorEmail,password:temporaryPassword,role:'operator'},status:201});
    const priorSession = (await endpoint('staff/login',{method:'POST',body:{email:operatorEmail,password:temporaryPassword}})).token;
    await endpoint('staff/forgot-password',{method:'POST',body:{email:operatorEmail},status:409});
    await endpoint('staff/'+staffRecord.doc.id,{method:'PATCH',auth,body:{password:operatorPassword}});
    await endpoint('health-board',{auth:priorSession,status:[401,403]});
    await endpoint('staff/login',{method:'POST',body:{email:operatorEmail,password:temporaryPassword},status:401});
    const operator = (await endpoint('staff/login',{method:'POST',body:{email:operatorEmail,password:operatorPassword}})).token;
    await endpoint('site-traffic', { status: 403 });
    assert.equal((await endpoint('site-traffic', { auth: operator })).trend.length, 7);
    const dashboard = await request(admin + '/admin', { cookie: 'payload-token=' + operator });
    assert.match(dashboard.toString(), /class="op-chart-plot"/);
    assert.doesNotMatch(dashboard.toString(), /class="op-traffic-placeholder"/);
    await endpoint('staff',{method:'POST',auth:operator,body:{email:'denied@example.test',password:token(),role:'owner'},status:403});
    await endpoint('health-board',{status:403});
    const board = await endpoint('health-board',{auth});
    assert.ok(board.checks.length >= 10 && board.checks.every(item=>item.state==='unconfigured'));
    await community('staff/registrations',{status:401});
    const desk = (path, method = 'GET', body, query) => endpoint('desk',{method:'POST',auth:operator,staff:true,body:{path,method,data:body,query}});
    await endpoint('desk',{method:'POST',auth:operator,staff:true,body:{path:'login',method:'POST'},status:400});
    if (process.env.GUIDE_BROWSER === '1') {
      const {verifyGuideEditor} = await import('./verify-guide-editor-browser.mjs');
      await verifyGuideEditor({site:previewOrigin,operator,endpoint});
    }
    console.log('核验攻略编辑、草稿隔离、发布更新、冲突保护与删除…');
    await endpoint('guide', {status:403});
    const guide = await endpoint('guide', {auth:operator});
    assert.equal(guide.rows.length,3);
    const guideRows = structuredClone(guide.rows);
    const guideArticle = {id:'integration-article',title:'攻略后台验收',author:'验收作者',university:'验收大学',uploadedAt:'2026-11-27',body:'## 新标题\n\n运营后台发布的 Markdown。'};
    guideRows[0].chapters.unshift(guideArticle);
    const guideDraft = await endpoint('guide',{method:'POST',auth:operator,staff:true,body:{rows:guideRows,revision:guide.revision,status:'draft'}});
    assert.ok(!(await request(site+'/site-content/earth-guide.json')).articles[guideArticle.id]);
    assert.equal((await endpoint('site-preview?key=earthGuide',{auth:operator})).sections.earthGuide[0].chapters[0].body,guideArticle.body);
    await endpoint('guide',{method:'POST',auth:operator,staff:true,body:{rows:guideRows,revision:guide.revision,status:'published'},status:409});
    await endpoint('guide',{method:'POST',auth:operator,body:{rows:guideRows,revision:guideDraft.revision,status:'published'},status:403});
    const guidePublication = await endpoint('guide',{method:'POST',auth:operator,staff:true,body:{rows:guideRows,revision:guideDraft.revision,status:'published'}});
    assert.deepEqual((await request(site+'/site-content/earth-guide.json')).articles[guideArticle.id],Object.fromEntries(Object.entries(guideArticle).filter(([key])=>key!=='id')));
    assert.equal((await request(previewOrigin+'/site-content/earth-guide.json')).groups[0].chapters[0].id,guideArticle.id);
    const guideEmpty = await endpoint('guide',{method:'POST',auth:operator,staff:true,body:{rows:[],revision:guidePublication.revision,status:'published'}});
    assert.deepEqual((await request(site+'/site-content/earth-guide.json')).groups,[]);
    await endpoint('guide',{method:'POST',auth:operator,staff:true,body:{rows:guide.rows,revision:guideEmpty.revision,status:'published'}});
    await endpoint('research', { status: 403 });
    const research = await endpoint('research', { auth: operator });
    assert.ok(research.rows.some(row => row.kind === 'certificate') && research.rows.some(row => row.kind === 'photo'));
    const researchRow = { id: 'integration-research', title: '后台科研素材验收', kind: 'certificate',
      image: '/images/competition/certificate-01-thumb.webp', aspectRatio: 0.7 };
    const researchRows = [...research.rows, researchRow];
    const researchDraft = await endpoint('research', { method: 'POST', auth: operator, staff: true,
      body: { rows: researchRows, revision: research.revision, status: 'draft' } });
    const manifestPath = site + '/site-content/manifest.json';
    assert.ok(!(await request(manifestPath)).sections.competitionItems?.some(row => row.id === researchRow.id));
    await endpoint('research', { method: 'POST', auth: operator, staff: true,
      body: { rows: researchRows, revision: researchDraft.revision, status: 'published' } });
    assert.ok((await request(manifestPath)).sections.competitionItems.some(row => row.id === researchRow.id));
    console.log('核验官网注册、运营用户目录、权限、撤销会话、恢复与审计…');
    await verifyCommunityUsers({community,endpoint,desk,owner:auth,operator,admin,site});
    const sharp = createRequire(join(source, 'package.json'))('sharp');
    const projectJpeg = await sharp({create:{width:160,height:160,channels:3,background:'#555'}}).jpeg().toBuffer();
    const projectImage = 'data:image/jpeg;base64,'+projectJpeg.toString('base64');
    const staffProject = {
      id: randomUUID(), name: '后台共创作品', author: '测试创作团队', summary: '运营后台录入的作品',
      description: '审核通过后在共创广场展示。', demoUrl: 'https://example.test/work',
      imageUrl:projectImage,bannerUrl:projectImage,showcaseImages:[projectImage,projectImage],
    };
    await endpoint('desk', { method: 'POST', staff: true, status: 403,
      body: { path: 'staff/projects', method: 'POST', data: staffProject } });
    const added = await desk('staff/projects', 'POST', staffProject);
    assert.equal(added.status, 'pending');
    const filename=added.imageUrl.split('/').pop();
    await endpoint('project-media/'+filename,{status:403});
    assert.deepEqual(await endpoint('project-media/'+filename,{auth:operator}),projectJpeg);
    await request(site+added.imageUrl,{status:404});
    assert.equal(added.showcaseImages.length,2);
    assert.deepEqual(await desk('staff/projects', 'POST', staffProject), added);
    assert.equal((await desk('staff/projects')).filter(project => project.id === added.id).length, 1);
    await community('projects/' + added.id, { status: 404 });
    const staffProjectPath = 'staff/projects/' + added.id;
    await desk(staffProjectPath + '/review', 'POST', { status: 'returned', note: '请补充作品介绍。' });
    const updated = await desk(staffProjectPath, 'POST', { ...staffProject, description: '已补充作品介绍。' });
    assert.equal(updated.status, 'pending');
    await desk(staffProjectPath + '/review', 'POST', { status: 'approved' });
    const publicProject = await community('projects/' + added.id);
    assert.equal(publicProject.author, staffProject.author);
    assert.equal(publicProject.description, updated.description);
    assert.ok(!Object.hasOwn(publicProject, 'createdByStaff'));

    console.log('核验实际上传、草稿预览、发布、引用保护与旧版本…');
    const mediaData = new FormData();
    // A small original PNG is generated with the same image library used by the CMS.
    const img = await sharp({ create:{width:300,height:200,channels:3,background:{r:50,g:120,b:185}} }).png().toBuffer();
    mediaData.set('_payload',JSON.stringify({alt:'独立集成测试图像'}));
    mediaData.set('file',new Blob([img],{type:'image/png'}),'integration-photo.png');
    const upload = (await endpoint('media',{method:'POST',auth:operator,body:mediaData,status:201})).doc;
    assert.equal(upload.width,300); assert.equal(upload.height,200); assert.ok(upload.sizes.thumb.url);
    assert.match(upload.url,/^\/cms-api\/media\/file\//);
    assert.deepEqual(await request(new URL(upload.url,admin)),img);
    assert.deepEqual(await request(new URL(upload.url,previewOrigin)),img);
    assert.ok((await request(new URL(upload.sizes.thumb.url,previewOrigin))).byteLength > 50);
    const section = (await endpoint('sections?where[sectionKey][equals]=activityPhotos&limit=1',{auth})).docs[0];
    assert.ok(section); const rows=structuredClone(section.rows);
    const title = '独立验收照片 ' + randomUUID(), key=section.sectionKey;
    rows[0]={...rows[0],src:upload.url,title};
    const draftPath = 'sections/'+section.id;
    await endpoint(draftPath+'?draft=true',{method:'PATCH',auth:operator,body:{rows,_status:'draft'}});
    await endpoint('site-preview?key='+key,{status:401});
    assert.ok(!(JSON.stringify(await published())).includes(title));
    assert.equal((await endpoint('site-preview?key='+key,{auth:operator})).sections[key][0].title,title);
    assert.ok((await endpoint('media-usage/'+upload.id,{auth})).includes(section.title));
    await endpoint('media/'+upload.id,{method:'DELETE',auth,status:409});
    await endpoint(draftPath,{method:'PATCH',auth:operator,body:{rows,_status:'published'}});
    assert.equal((await published()).sections[key][0].title,title);
    assert.equal((await request(previewOrigin+'/site-content/manifest.json')).sections[key][0].src,upload.url);
    const versions = await endpoint('sections/versions?where[parent][equals]='+section.id+'&limit=10',{auth});
    assert.ok(versions.totalDocs >= 2);
    const nextTitle='尚未发布 '+randomUUID();
    await endpoint(draftPath+'?draft=true',{method:'PATCH',auth:operator,body:{rows:rows.map((r,i)=>i===0?{...r,title:nextTitle}:r),_status:'draft'}});
    assert.equal((await published()).sections[key][0].title,title);
    assert.equal((await endpoint('site-preview?key='+key,{auth})).sections[key][0].title,nextTitle);

    console.log('核验两端活动、免登录报名、审核和回执…');
    const eventId='ops-integration', record={ id:eventId, name:'运营集成验收',description:'实际 CMS 与社区 API 的联动。',date:(new Date().getUTCFullYear()+1)+'.12.01',type:'共创活动',
      coverUrl:upload.url,registrationMode:'review',formFields:[{id:'interest',label:'关注什么？',type:'text',required:true}] };
    const draft = await desk('staff/events','POST',record);
    assert.deepEqual(await endpoint('work-queue', { auth: operator }), { events: 1, registrations: 0, projects: 0 });
    assert.deepEqual(await desk('staff/events','POST',record), draft);
    await community('events/'+eventId,{status:404});
    const eventPath = 'staff/events/'+eventId;
    const saved = await desk(eventPath,'POST',{ draftRevision:draft.draftRevision, subtitle:'已核对活动时间' });
    const conflict = await endpoint('desk',{method:'POST',auth,staff:true,status:409,
      body:{path:eventPath+'/publish',method:'POST',data:{draftRevision:draft.draftRevision}}});
    assert.match(conflict.error,/重新打开/);
    const approval = {draftRevision:saved.draftRevision};
    const live = await desk(eventPath+'/publish','POST',approval);
    assert.deepEqual(await desk(eventPath+'/publish','POST',approval),live);
    assert.equal((await community('events/'+eventId)).coverUrl,upload.url);
    console.log('核验后台置顶位与官网展示顺序…');
    const emptyPins = [null, null, null];
    await desk('staff/home-pins/events', 'POST', { slots: [null, eventId, null], expected: emptyPins });
    await desk('staff/home-pins/projects', 'POST', { slots: [null, added.id, null], expected: emptyPins });
    assert.equal((await community('events?view=card')).find(item => item.id === eventId).homePinPosition, 2);
    assert.equal((await community('projects')).find(item => item.id === added.id).homePinPosition, 2);
    if (process.env.OPERATIONS_BROWSER === '1') {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ channel: 'chrome' });
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 844 } });
        await page.goto(site + '/players');
        const featuredEvent = page.locator('.calendar-featured .calendar-lead').nth(1);
        await featuredEvent.getByRole('heading', { name: record.name, exact: true }).waitFor();
        await featuredEvent.getByText('置顶第 2 位', { exact: true }).waitFor();
        assert.equal(await page.locator('.calendar-featured .community-pin-badge').count(), 1);
        await page.goto(site + '/plaza');
        const featuredProject = page.locator('.plaza-popular .community-list-card').nth(1);
        await featuredProject.getByRole('heading', { name: staffProject.name, exact: true }).waitFor();
        await featuredProject.getByText('置顶第 2 位', { exact: true }).waitFor();
        assert.equal(await page.locator('.plaza-popular .community-pin-badge').count(), 1);
      } finally {
        await browser.close();
      }
    }
    const signup={name:'集成玩家',phone:'13800000009',wechat:'ops_player',answers:{interest:'交互设计'},idempotencyKey:token()};
    const receipt=await community('events/'+eventId+'/registrations',{method:'POST',body:signup});
    const rosterEvent = (await desk('staff/events', 'GET', undefined, { view: 'roster' })).find(row => row.id === eventId);
    assert.deepEqual(Object.keys(rosterEvent).sort(), ['formFields', 'id', 'name']);
    assert.equal(receipt.status,'pending');
    assert.deepEqual(await endpoint('work-queue', { auth: operator }), { events: 0, registrations: 1, projects: 0 });
    const duplicate=await community('events/'+eventId+'/registrations',{method:'POST',body:signup});assert.equal(duplicate.id,receipt.id);
    const list=await desk('staff/registrations','GET',undefined,{event:eventId});assert.equal(list.length,1);assert.equal(list[0].phone,signup.phone);assert.equal(list[0].wechat,signup.wechat);
    await desk('staff/registrations/'+receipt.id+'/review','POST',{status:'approved'});
    assert.deepEqual(await endpoint('work-queue', { auth: operator }), { events: 0, registrations: 0, projects: 0 });
    assert.equal((await community('registration-status',{method:'POST',body:{id:receipt.id,receiptToken:receipt.receiptToken}})).status,'approved');
    await community('registration-status',{method:'POST',body:{id:receipt.id,receiptToken:token()},status:404});
    console.log('核验专题照片的独立素材引用与归档…');
    mediaData.set('file',new Blob([img],{type:'image/png'}),'event-only-photo.png');
    const albumAsset=(await endpoint('media',{method:'POST',auth:operator,body:mediaData,status:201})).doc;
    await desk('staff/events/'+eventId,'POST',{status:'active'});
    await desk('staff/events/'+eventId+'/publish','POST',{});
    const photo=await desk('staff/photos','POST',{eventId,title:'活动合影',category:'activity',imageUrl:albumAsset.url,credit:'拍摄者'});
    const revised=await desk('staff/photos/'+photo.id,'POST',{title:'专题封面'});
    assert.equal(revised.title,'专题封面');
    const photos=await desk('staff/photos','GET',undefined,{event:eventId});assert.equal(photos[0].image,albumAsset.url);
    const albums=await community('albums');assert.ok(albums.find(a=>a.eventId===eventId).photos.some(p=>p.id===photo.id));
    assert.ok((await endpoint('media-usage/'+albumAsset.id,{auth})).length);
    await endpoint('media/'+albumAsset.id,{method:'DELETE',auth,status:409});
    await desk('staff/photos/'+photo.id+'/remove','POST',{});
    await endpoint('media/'+albumAsset.id,{method:'DELETE',auth});
    await request(new URL(albumAsset.url,admin),{status:404});
    assert.ok(!((await published()).images||{})[albumAsset.url]);
    await desk('staff/events/'+eventId+'/archive','POST',{});
    await community('events/'+eventId,{status:404});
    if (process.env.EVENT_ENTRY_BROWSER === '1') {
      const {verifyEventEntry} = await import('./verify-event-entry-browser.mjs');
      await verifyEventEntry({site:previewOrigin,operator,desk});
    }
    console.log('通过：正式迁移与构建、后台权限、素材上传与保护、预览与发布隔离、活动报名审核、运维看板。');
  } catch (error) {
    const compact = (cmsServer.output()+'\n'+server.output()).split('\n').filter(line => /Error:|ERROR:|Failed|Cannot find/.test(line)).slice(-8).join('\n');
    if (compact) console.error(compact);
    throw error;
  }
}
for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>{void cleanup().then(()=>process.exit(1));});
try { await run(); } catch(error) {console.error(error.message);process.exitCode=1;} finally {await cleanup();}
