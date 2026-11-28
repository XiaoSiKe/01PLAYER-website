import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const origin=process.env.COMMUNITY_PREVIEW_URL||'http://127.0.0.1:5173';
const projects=await(await fetch(origin+'/api/community/projects')).json();
const project=projects.find(p=>p.name==='课余日历（虚拟项目）');
assert.ok(project,'请先创建本地虚拟项目与招募。');
const teams=await(await fetch(origin+'/api/community/recruitments')).json();
const team=teams.find(t=>t.projectId===project.id);
assert.ok(team);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of[1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/players?event='+team.eventId+'&recruit='+team.id);
  await page.locator('.recruitment-detail-meta').getByRole('link',{name:'查看'+team.author+'的个人主页'}).click();
  await page.getByRole('heading',{name:team.author,exact:true,level:1}).waitFor();
  await page.goto(origin+'/plaza?project='+project.id);
  const facts=page.locator('.project-detail-facts');
  await facts.getByRole('link',{name:project.author,exact:true}).click();
  await page.getByRole('heading',{name:project.author,exact:true,level:1}).waitFor();
  await page.locator('.public-player-page').getByRole('link',{name:'返回',exact:true}).click();
  const share=page.locator('.detail-section-actions').getByRole('button',{name:'分享',exact:true});
  await share.waitFor();assert.equal(await share.locator('svg').count(),0);
  await page.getByRole('button',{name:'收藏 '+(project.saves||0),exact:true}).waitFor();
  const source=facts.locator('dd .community-source');assert.ok(await source.getAttribute('href'));
  await source.click();await page.getByRole('heading',{name:'零一 AI 创造挑战赛',exact:true,level:1}).waitFor();
  assert.equal(await page.locator('.detail-section-actions').getByRole('button',{name:'分享',exact:true}).locator('svg').count(),0);
  await page.goto(origin+'/plaza?q='+encodeURIComponent(project.name));
  const card=page.locator('.community-list-card').filter({has:page.getByRole('heading',{name:project.name,exact:true})}).first();
  await card.locator('.community-card-meta').getByRole('link',{name:project.author,exact:true}).click();
  await page.getByRole('heading',{name:project.author,exact:true,level:1}).waitFor();
  await page.goto(origin+'/plaza?q='+encodeURIComponent(project.name));
  await card.getByRole('link',{name:'招募中',exact:true}).click();
  await page.waitForFunction(()=>new URL(location.href).hash==='#project-recruitment');
  await page.getByRole('navigation',{name:'项目详情目录'}).getByRole('link',{name:'项目招募',exact:true}).waitFor();
  await page.goto(origin+'/plaza?q='+encodeURIComponent(project.name));
  await card.getByRole('link',{name:'示例',exact:true}).click();
  if(width<=760) await page.getByRole('button',{name:'搜索项目或作者',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索项目或作者'}).waitFor();
  assert.equal(await page.getByRole('searchbox',{name:'搜索项目或作者'}).inputValue(),'示例');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.close();console.log('通过 虚拟玩家主页、项目作者与来源、标签点击、收藏数字、纯文字分享',width);
 }
}finally{await browser.close()}
