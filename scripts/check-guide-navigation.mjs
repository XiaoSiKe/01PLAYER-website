import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin=process.env.COMMUNITY_PREVIEW_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const errors=[];
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  const body='## 开始\n\n'+('这是一个阅读段落，保留足够空间用于验证目录定位。\n\n').repeat(45)+'### 学习方法\n\n继续尝试。\n\n## 开始\n\n第二次同名标题。\n\n```md\n## 代码中的标题\n```';
  const groups=Array.from({length:7},(_,i)=>({id:'reading-test-'+i,title:'目录 '+i,chapters:[{id:'article-test-'+i,title:'文章 '+i}]}));
  groups[0].chapters=Array.from({length:5},(_,i)=>({id:'article-test-0-'+i,title:'文章 0.'+i}));
  const articles=Object.fromEntries(groups.flatMap(group=>group.chapters.map(chapter=>[chapter.id,{body,author:'验收玩家',university:'验收大学',uploadedAt:'2026-11-28'}])));
  await page.route('**/site-content/manifest.json',route=>route.fulfill({json:{sections:{}}}));
  await page.route('**/site-content/earth-guide.json',route=>route.fulfill({json:{revision:'layout-fixture',groups,articles}}));
  await page.goto(origin+'/earth');
  await page.locator('.guide-folder').last().waitFor();
  const geometry=await page.evaluate(()=>({
    columns:getComputedStyle(document.querySelector('.guide-folders')).gridTemplateColumns.split(' ').length,
    rows:[...document.querySelectorAll('.guide-folder-sleeve')].map(el=>el.getBoundingClientRect().top),
    skill:document.querySelector('.guide-skill').getBoundingClientRect().width/document.querySelector('.guide-article').getBoundingClientRect().width,
    gap:document.querySelector('.guide-folder-sleeve').getBoundingClientRect().top-document.querySelector('#reading').getBoundingClientRect().bottom,
  }));
  assert.equal(geometry.columns,5);assert.equal(new Set(geometry.rows.slice(0,5)).size,1);assert.ok(geometry.rows[5]>geometry.rows[0]);
  assert.ok(Math.abs(geometry.skill-.6)<.01);assert.ok(geometry.gap<40);
  await page.getByRole('heading',{name:'「零一玩家」地球生存攻略 Skill',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'首页小节'}).getByRole('link',{name:'章节目录',exact:true}).waitFor();
  await page.locator('.guide-folder-sleeve').first().scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>({left:document.querySelector('.guide-folder-sleeve').getBoundingClientRect().left,top:document.querySelector('.guide-folder-sleeve').getBoundingClientRect().top+scrollY,rows:[...document.querySelectorAll('.guide-folder-stage')].map(node=>node.getBoundingClientRect().top+scrollY)}));
  assert.ok(Math.abs(before.left-await page.locator('#reading').evaluate(node=>node.getBoundingClientRect().left))<1);
  await page.locator('.guide-folder-sleeve').first().click();
  const after=await page.evaluate(()=>({left:document.querySelector('.guide-folder-sleeve').getBoundingClientRect().left,top:document.querySelector('.guide-folder-sleeve').getBoundingClientRect().top+scrollY,rows:[...document.querySelectorAll('.guide-folder-stage')].map(node=>node.getBoundingClientRect().top+scrollY)}));
  assert.deepEqual(after,before);

  assert.equal(await page.locator('.guide-folder-extra').count(),0);
  const folder=page.locator('.guide-folder').first();
  await folder.getByRole('button',{name:'「目录 0」下一页文章',exact:true}).click();
  assert.equal(await folder.locator('.guide-folder-paper').count(),2);
  assert.equal(await folder.locator('.guide-folder-paper').first().getAttribute('href'),'#article-test-0-3');
  await folder.getByRole('button',{name:'「目录 0」上一页文章',exact:true}).click();
  await folder.locator('.guide-folder-paper').first().click();
  const outline=page.getByRole('navigation',{name:'文章小节'});
  await outline.getByRole('link').first().waitFor();
  assert.deepEqual(await outline.getByRole('link').allTextContents(),['开始','学习方法','开始']);
  const links=outline.getByRole('link');
  assert.notEqual(await links.nth(0).getAttribute('href'),await links.nth(2).getAttribute('href'));
  assert.equal(await links.nth(1).evaluate(el=>getComputedStyle(el).getPropertyValue('--outline-level').trim()),'1');
  await links.nth(2).click();await page.waitForTimeout(250);
  assert.equal(await links.nth(2).getAttribute('aria-current'),'location');
  await page.reload();await outline.getByRole('link').nth(2).waitFor();
  assert.equal(await page.locator('[id="guide-heading-开始-1"]').evaluate(el=>el===document.activeElement),true);
  await page.mouse.move(600,350);await page.mouse.wheel(0,-10000);await page.waitForFunction(()=>scrollY===0);await page.waitForTimeout(200);
  assert.equal(await links.nth(0).getAttribute('aria-current'),'location');
  for(const width of[1024,390,320]) {
    await page.setViewportSize({width,height:900});await page.goto(origin+'/earth');
    await page.locator('.guide-folder').last().waitFor();
    const sleeves=page.locator('.guide-folder-sleeve');
    for(let i=0;i<await sleeves.count();i++)await sleeves.nth(i).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await page.locator('.guide-folders').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length<=5));
    await sleeves.first().focus();await page.keyboard.press('Escape');assert.equal(await sleeves.first().getAttribute('aria-expanded'),'false');
  }
  await page.close();
  for(const reducedMotion of['reduce','no-preference']) {
    const project=await browser.newPage({viewport:{width:1440,height:900},reducedMotion});
    project.on('pageerror',error=>errors.push(error.message));
    await project.goto(origin+'/plaza?project=campus-agent');
    const nav=project.getByRole('navigation',{name:'项目详情目录'});
    const recruitment=nav.getByRole('link',{name:'项目招募',exact:true});
    await recruitment.click();assert.equal(await recruitment.getAttribute('aria-current'),'location');
    await project.waitForTimeout(650);assert.equal(await recruitment.getAttribute('aria-current'),'location');
    await nav.getByRole('link',{name:'项目介绍',exact:true}).click();
    await project.waitForTimeout(650);assert.equal(await nav.getByRole('link',{name:'项目介绍',exact:true}).getAttribute('aria-current'),'location');
    await project.close();
  }
  assert.deepEqual(errors,[]);
  console.log('通过：紧凑目录最多五列、标题下方对齐、Skill 六成宽度、Markdown 层级及重名锚点、选中与滚动、手机布局和项目招募导航。');
}finally{await browser.close()}
