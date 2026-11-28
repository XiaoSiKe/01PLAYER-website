import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const origin=process.env.COMMUNITY_PREVIEW_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const owner={id:'submission-preview',name:'投稿预览玩家',role:'player'};
const events=['target','other'].map(id=>({id,name:id==='target'?'当前活动':'其他活动',category:'competition',type:'赛事',status:'active',description:'投稿预选验证',startsAt:'2035-12-01T12:00:00Z',endsAt:'2035-12-02T12:00:00Z',submissionsOpen:true,registrationOpen:true,rules:[],formFields:[]}));
try {
 for(const [width,signedIn] of [[1440,true],[390,true],[390,false]]) {
  let user=signedIn?owner:null;
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});
  await page.addInitScript(owner=>sessionStorage.setItem('community-draft-'+owner.id+'-target',JSON.stringify({submissionSource:'independent',eventId:'other',name:'保留原有草稿内容',summary:'草稿简介',description:'草稿正文'})),owner);
  await page.route('**/api/community/**',route=>{
   const path=new URL(route.request().url()).pathname.split('/api/community/')[1];
   if(path==='login')user=owner;
   const data=path==='session'||path==='login'?{user,demo:true}:path==='events'?events:path.startsWith('events/')?events.find(event=>event.id===path.slice(7)):path==='mine'?{projects:[],registrations:[],recruitments:[]}:[];
   return route.fulfill({json:data});
  });
  await page.goto(origin+'/players?event=target');
  await page.getByRole('link',{name:'提交作品',exact:true}).click();
  if(!signedIn) {
   await page.locator('[name=email]').fill('preview@example.test');await page.locator('[name=password]').fill('Local-Preview-123');
   await page.getByRole('button',{name:'欢迎加入地球Online：零一玩家',exact:true}).click();
   await page.getByRole('link',{name:'继续发布项目',exact:true}).click();
  }
  await page.getByLabel('选择活动',{exact:false}).waitFor();
  assert.equal(await page.getByRole('radio',{name:'玩家计划',exact:true}).isChecked(),true);
  assert.equal(await page.locator('select[name=eventId]').inputValue(),'target');
  assert.equal(await page.locator('[name=name]').inputValue(),'保留原有草稿内容');
  await page.reload();await page.locator('select[name=eventId]').waitFor();assert.equal(await page.locator('select[name=eventId]').inputValue(),'target');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.close();console.log('通过 从活动投稿预选本场，旧草稿不覆盖活动，登录与刷新保持选择',width,signedIn);
 }
}finally{await browser.close()}
