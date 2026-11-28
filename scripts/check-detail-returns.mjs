import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin=process.env.COMMUNITY_PREVIEW_URL || 'http://127.0.0.1:5173';
const event={id:'return-event',name:'返回路径验收活动',category:'competition',type:'赛事',status:'active',description:'活动介绍',date:'2035.12.01',startsAt:'2035-12-01T10:00:00+08:00',endsAt:'2035-12-01T18:00:00+08:00',registrationOpen:true,submissionsOpen:true,formFields:[],rules:[]};
const project={id:'return-project',name:'返回路径验收项目',author:'测试玩家',ownerId:'return-owner',status:'approved',summary:'返回来源验证',description:'项目介绍。',demoUrl:'https://example.test/demo',eventId:event.id,likes:0,saves:0,showcaseImages:[]};
const receipt={id:'return-receipt',eventId:event.id,receiptToken:'local-test-only',status:'approved',participantName:'测试玩家',event};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [1440,390,320]) {
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(receipt=>localStorage.setItem('01player.web.receipt.'+receipt.id,JSON.stringify(receipt)),receipt);
  await page.route('**/api/community/**',route=>{
   const path=new URL(route.request().url()).pathname.slice('/api/community/'.length);
   const data=path==='session'?{user:null,demo:true}:path==='events'?[event]:path==='events/'+event.id?event:path==='projects'?[project]:path==='projects/'+project.id?project:path==='registration-status'?receipt:[];
   return route.fulfill({json:data});
  });
  async function assertActions() {
   const group=page.locator('.detail-share-return');await group.getByRole('link',{name:'返回',exact:true}).waitFor();
   const share=await group.getByRole('button',{name:'分享',exact:true}).boundingBox(),back=await group.getByRole('link',{name:'返回',exact:true}).boundingBox();
   assert.ok(back.x>=share.x+share.width && Math.abs(back.y+back.height/2-share.y-share.height/2)<2);
   const styles=await group.evaluate(group=>{
    const controls=[group.querySelector('button'),group.querySelector('a')];
    return controls.map(control=>{const style=getComputedStyle(control);return ['borderRadius','borderColor','backgroundColor','fontSize','fontWeight','padding','height'].map(key=>style[key]);});
   });assert.deepEqual(styles[0],styles[1]);

   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  const goBack=()=>page.locator('.detail-share-return').getByRole('link',{name:'返回',exact:true}).click();
  await page.goto(origin+'/players?category=competition&q='+encodeURIComponent('返回'));
  await page.locator('.calendar-lead').click();await assertActions();
  const eventUrl=page.url();
  await page.getByRole('link',{name:'查看报名',exact:true}).click();await page.locator('.registration-ticket').waitFor();
  await page.reload();await page.locator('.registration-ticket').waitFor();
  assert.equal(await page.locator('.registration-receipt-return').count(),0);
  await page.locator('.registration-receipt-status').getByRole('link',{name:'返回',exact:true}).click();await page.waitForURL(eventUrl);
  await goBack();await page.waitForFunction(()=>!new URLSearchParams(location.search).has('event'));
  assert.equal(new URL(page.url()).searchParams.get('q'),'返回');assert.equal(new URL(page.url()).searchParams.get('category'),'competition');
  await page.locator('.calendar-lead').click();await assertActions();
  const fromEvent=page.url();
  await page.locator('.event-works-grid .community-list-card').click();await assertActions();
  await page.reload();await assertActions();await goBack();await page.waitForURL(fromEvent);

  await page.goto(origin+'/plaza?q='+encodeURIComponent('返回')+'&source=club');
  await page.locator('.community-list-card-title a').first().click();await assertActions();
  const projectUrl=page.url();
  await page.locator('.project-detail-facts .community-source').click();await assertActions();
  const viaProject=page.url();
  await page.getByRole('link',{name:'查看报名',exact:true}).click();await page.locator('.registration-ticket').waitFor();
  await page.locator('.registration-receipt-status').getByRole('link',{name:'返回',exact:true}).click();await page.waitForURL(viaProject);
  await goBack();await page.waitForURL(projectUrl);await goBack();await page.waitForFunction(()=>!new URLSearchParams(location.search).has('project'));
  assert.equal(new URL(page.url()).searchParams.get('q'),'返回');assert.equal(new URL(page.url()).searchParams.get('source'),'club');

  await page.goto(origin+'/players?view=tickets');await page.locator('.registration-record').click();await page.locator('.registration-ticket').waitFor();
  await page.locator('.registration-receipt-status').getByRole('link',{name:'返回',exact:true}).click();await page.waitForURL(/view=tickets/);
  for(const suffix of ['', '&from=https%3A%2F%2Fother.test']) {
   await page.goto(origin+'/plaza?project='+project.id+suffix);await assertActions();
   assert.equal(await page.locator('.detail-share-return').getByRole('link',{name:'返回',exact:true}).getAttribute('href'),'/plaza');
  }
  assert.deepEqual(errors,[]);await page.close();
  console.log('通过 分享右侧返回、活动/项目/票根逐层来源、筛选与刷新、无来源回退、无顶部票根返回',width);
 }
}finally{await browser.close()}
