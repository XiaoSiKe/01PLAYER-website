import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const origin=process.env.COMMUNITY_PREVIEW_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const catalog=['competition','salon','activity'].map((category,i)=>({
 id:'category-'+category,name:'分类样例 '+i,category,type:['赛事','沙龙','合作'][i],status:'open',
 description:'用于类型筛选与跳转验收。',date:'2035.12.01',registrationOpen:true,rules:[],formFields:[],submissionsOpen:false,
}));
try{
 for(const width of[1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/community/events**',route=>{
   const url=new URL(route.request().url()),id=url.pathname.split('/api/community/events/')[1];
   return route.fulfill({json:id ? catalog.find(event=>event.id===id) : catalog});
  });
  await page.goto(origin+'/players');
  const types=page.getByRole('group',{name:'活动分类'});
  await types.getByRole('button',{name:'合作',exact:true}).waitFor();
  assert.deepEqual(await types.getByRole('button').allTextContents(),['全部','赛事','沙龙','合作']);
  await types.getByRole('button',{name:'合作',exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('category')==='activity');
  assert.equal(await page.locator('.calendar-cards .calendar-card').count(),1);
  assert.equal(await page.locator('.calendar-cards .calendar-labels span').nth(1).innerText(),'合作');
  await page.reload();await types.getByRole('button',{name:'合作',exact:true}).waitFor();
  assert.equal(await types.getByRole('button',{name:'合作',exact:true}).getAttribute('aria-pressed'),'true');
  await page.locator('.calendar-cards .calendar-card').click();
  await page.getByRole('link',{name:'参与合作',exact:true}).waitFor();
  assert.ok((await page.locator('.event-entry .calendar-labels').innerText()).includes('合作'));
  await page.getByRole('link',{name:'参与合作',exact:true}).click();
  await page.getByRole('button',{name:'提交报名',exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await page.close();console.log('通过 三分类顺序、合作筛选及刷新、卡片详情与报名入口',width);
 }
 for(const width of [1440,390,320]) {
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/community/albums*',route=>route.fulfill({json:[
  {eventId:'category-activity',category:'activity',type:'合作',name:'合作影像样例',example:true,photos:[{id:'co-photo',title:'合作合影',category:'activity',image:'/images/club-logo-white.svg'}]},
  {eventId:'category-competition',category:'competition',name:'赛事影像样例',photos:[{id:'race',title:'比赛现场样例',category:'competition',image:'/images/club-logo-black.svg'},{id:'team',title:'单独团建样例',category:'team-building',image:'/images/club-logo-horizontal-black.svg'}]},
  {eventId:'category-salon',category:'salon',name:'沙龙影像样例',photos:[{id:'salon',title:'沙龙现场样例',category:'activity',image:'/images/club-logo-horizontal-white.svg'}]},
 ]}));
 await page.goto(origin+'/?page=time-machine&category=activity');
 const toggle=page.locator('.tm-catalog-toggle');await toggle.getByText('玩家计划',{exact:true}).waitFor();
 await toggle.click();const directory=page.getByRole('dialog',{name:'影像目录'});
 assert.deepEqual(await directory.locator('.tm-directory-list > li > button').allTextContents(),['全部影像','玩家计划','零一团建']);
 assert.deepEqual(await directory.getByRole('list',{name:'玩家计划分类'}).getByRole('button').allTextContents(),['赛事','沙龙','合作']);
 const bounds=await directory.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=900);
 await directory.getByRole('button',{name:'合作',exact:true}).click();
 await page.locator('.tm-session-select').getByRole('button').click();
 const choices=page.getByRole('menuitemradio');assert.ok((await choices.allTextContents()).includes('合作影像样例（示例）'));
 assert.ok(!(await choices.allTextContents()).some(text=>text.includes('赛事影像样例')));
 await page.getByRole('menuitemradio',{name:'合作影像样例（示例）',exact:true}).click();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get('event')==='category-activity');
 await page.reload();await toggle.getByText('玩家计划',{exact:true}).waitFor();
 await toggle.click();await directory.getByRole('button',{name:'玩家计划',exact:true}).click();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get('category')==='plan');
 await page.waitForFunction(()=>[...document.querySelectorAll('.pg-cell')].some(cell=>cell.dataset.title==='沙龙现场样例'));
 const titles=await page.locator('.pg-cell').evaluateAll(cells=>cells.map(cell=>cell.dataset.title));
 for(const name of ['合作合影','比赛现场样例','沙龙现场样例'])assert.ok(titles.includes(name));
 assert.ok(!titles.includes('单独团建样例'));
 await toggle.click();await directory.getByRole('button',{name:'零一团建',exact:true}).click();
 await toggle.getByText('零一团建',{exact:true}).waitFor();
 await page.locator('.tm-session-select').getByRole('button').click();
 await page.getByRole('menuitemradio',{name:'「零一」首次聚餐耍起',exact:true}).click();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get('event')==='history:first-team-dinner');
 await page.reload();await toggle.getByText('零一团建',{exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.pg-cell')].some(cell=>cell.dataset.src?.includes('activity-09.jpg')));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await page.close();console.log('通过 玩家计划模块、赛事/沙龙/合作分组、合集与团建隔离、旧链接和刷新',width);
 }
}finally{await browser.close()}
