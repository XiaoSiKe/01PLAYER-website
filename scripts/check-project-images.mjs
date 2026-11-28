import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createCommunityApi } from '../server/community-api.mjs';

const directory=await mkdtemp(join(tmpdir(),'01player-images-'));
const options={demo:true,dataFile:join(directory,'community.json')};
let api=createCommunityApi(options), browser;
const server=createServer((req,res)=>api(req,res));
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const apiOrigin='http://127.0.0.1:'+server.address().port;
const origin='http://127.0.0.1:5196';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5196','--strictPort'],{env:{...process.env,PLAYER_ORIGIN:apiOrigin},stdio:['ignore','pipe','pipe']});
let output='';vite.stdout.on('data',data=>output+=data);vite.stderr.on('data',data=>output+=data);
try {
 for(let i=0;i<80;i++) {try {if((await fetch(origin)).ok)break;}catch{} if(i===79)throw Error(output);await new Promise(done=>setTimeout(done,200));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
 const post=async(path,data)=>{const res=await context.request.post(origin+'/api/community/'+path,{headers:{'x-community-request':'1'},data});assert.ok(res.ok(),await res.text());return res.json();};
 await page.goto(origin);
 const {user}=await post('login',{email:'player@example.test',password:'Player-2026!'});
 const avatar=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=160;const x=c.getContext('2d');x.fillStyle='#555';x.fillRect(0,0,160,160);return c.toDataURL('image/jpeg');});
 await post('account/profile',{name:user.name,university:'示例大学',avatar});
 await page.goto(origin+'/plaza?view=publish');
 await page.getByRole('radio',{name:'自主投稿',exact:true}).check();
 await page.getByLabel('项目名称').fill('四图上传验收');
 const intro=page.getByLabel('项目简介',{exact:false});assert.equal(await intro.getAttribute('maxlength'),'20');await intro.fill('完整的项目图片与简介');
 await page.getByLabel('完整介绍').fill('介绍应该排在作品展示之前。');
 await page.getByLabel('项目链接（选填）').fill('');
 assert.equal(await page.getByLabel('卡片封面',{exact:true}).getAttribute('required'),'');
 assert.equal(await page.getByLabel('项目横幅',{exact:true}).getAttribute('required'),'');
 assert.equal(await page.getByLabel('作品展示图 1',{exact:true}).getAttribute('required'),null);
 assert.deepEqual(await page.locator('.project-image-label small').allTextContents(),['必选','必选','选填','选填']);
 for(const copy of ['作品展示图（选填，最多 2 张），展示在项目介绍下方。','卡片封面和项目链接至少填一项。','提交后显示「待审核」，通过后才会公开。'])assert.equal(await page.getByText(copy,{exact:true}).count(),0);
 const labels=['卡片封面','项目横幅','作品展示图 1','作品展示图 2'];
 for(const [index,label] of labels.entries()) {
  const image=await page.evaluate(index=>{const c=document.createElement('canvas');c.width=index?960:600;c.height=index?540:600;const x=c.getContext('2d');x.fillStyle=['#111','#555','#999','#ddd'][index];x.fillRect(0,0,c.width,c.height);x.fillStyle='#f00';x.fillRect(30,30,100,100);return c.toDataURL('image/png').split(',')[1];},index);
  await page.getByLabel(label,{exact:true}).setInputFiles({name:label+'.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await page.getByAltText(label+'预览',{exact:true}).waitFor();
 }
 if(process.env.PROJECT_IMAGE_CAPTURE) {await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:process.env.PROJECT_IMAGE_CAPTURE,fullPage:true});}
 assert.equal(await page.getByLabel('作品展示图 3',{exact:true}).count(),0);
 await page.getByRole('button',{name:'提交审核',exact:true}).click();
 await page.waitForURL(/submitted=/);
 const id=new URL(page.url()).searchParams.get('submitted');
 let project=await context.request.get(origin+'/api/community/projects/'+id).then(res=>res.json());
 assert.equal(project.showcaseImages.length,2);assert.equal(new Set([project.imageUrl,project.bannerUrl,...project.showcaseImages]).size,4);
 assert.ok((await context.request.get(origin+project.imageUrl)).ok());
 assert.equal((await fetch(origin+project.imageUrl)).status,404,'未审核图片不向访客公开');
 const admin=await browser.newContext();
 assert.ok((await admin.request.post(origin+'/api/community/login',{headers:{'x-community-request':'1'},data:{email:'admin@example.test',password:'Admin-2026!'}})).ok());
 assert.ok((await admin.request.post(origin+'/api/community/review/'+id,{headers:{'x-community-request':'1'},data:{status:'approved'}})).ok());
 const profile=await fetch(origin+'/api/community/profiles/'+user.id).then(res=>res.json());
 assert.equal(profile.university,'示例大学');assert.ok(profile.avatar.startsWith('/api/community/profiles/'));
 assert.equal((await fetch(origin+profile.avatar)).headers.get('content-type'),'image/jpeg');
 assert.equal((await fetch(origin+'/api/community/account/avatar?v='+profile.avatar.split('v=')[1])).status,401);
 api.close();api=createCommunityApi(options);
 assert.equal((await fetch(origin+project.bannerUrl)).headers.get('content-type'),'image/jpeg','重启后图片仍可读取');
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:950});
  await page.goto(origin+'/plaza?project='+id);
  await page.getByRole('heading',{name:'四图上传验收',level:1,exact:true}).waitFor();
  assert.deepEqual(await page.locator('.project-detail-main > section > h2').allTextContents(),['项目介绍','作品展示']);
  assert.equal(await page.locator('.project-showcase-images img').count(),2);
  assert.equal(await page.locator('.project-showcase-images a').count(),0);
  assert.equal(await page.getByText('查看原图',{exact:true}).count(),0);
  assert.equal(await page.locator('.detail-section-actions').getByRole('link',{name:'项目',exact:true}).count(),0);
  await page.waitForFunction(src=>document.querySelector('.detail-hero-media img')?.getAttribute('src')===src,project.bannerUrl);
  if(width>760) await page.waitForFunction(src=>document.querySelector('.detail-hero-thumbnail img')?.getAttribute('src')===src,project.imageUrl);
  await page.goto(origin+'/plaza?view=player&user='+user.id);
  await page.getByText('示例大学',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.public-player-avatar img')?.naturalWidth===160);
  assert.equal(await page.getByText('暂无公开招募。',{exact:true}).count(),0);
  const back=await page.locator('.public-player-page').getByRole('link',{name:'返回',exact:true}).boundingBox();
  const section=await page.locator('.public-player-page').boundingBox();assert.ok(back.x>section.x+section.width/2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.goto(origin+'/plaza?view=publish&edit='+id);
 await page.getByLabel('项目简介',{exact:false}).fill('修改后仍保留四张图');
 await page.getByRole('button',{name:'提交审核',exact:true}).click();await page.waitForURL(/submitted=/);
 project=await context.request.get(origin+'/api/community/projects/'+id).then(res=>res.json());assert.equal(project.showcaseImages.length,2);
 await page.goto(origin+'/plaza?view=publish&edit='+id);
 await page.getByLabel('项目链接（选填）').fill('https://example.test/demo');
 await page.getByRole('button',{name:'提交审核',exact:true}).click();await page.waitForURL(/submitted=/);
 assert.ok((await admin.request.post(origin+'/api/community/review/'+id,{headers:{'x-community-request':'1'},data:{status:'approved'}})).ok());
 await page.goto(origin+'/plaza?project='+id);
 await page.locator('.detail-section-actions').getByRole('link',{name:'项目',exact:true}).waitFor();
 assert.equal(await page.getByRole('alert').count(),0);assert.deepEqual(errors,[]);
 console.log('通过 上传封面、横幅和两张展示图；审核前后权限及重启持久化；公开头像和大学；1440/390/320 布局与返回位置；编辑保留图片。');
} finally {
 await browser?.close();vite.kill('SIGTERM');await new Promise(done=>server.close(done));api.close();await rm(directory,{recursive:true,force:true});
}
