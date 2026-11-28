import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const origin=process.env.COMMUNITY_PREVIEW_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const errors=[];
  for(const width of[390,320]) {
    const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    p.on('pageerror',e=>errors.push(e.message));
    await p.route('**/api/community/session',r=>r.fulfill({json:{user:{id:'demo-player',name:'验收玩家',role:'player'}}}));
    await p.goto(origin+'/');
    await p.locator('.site-account-link[data-authenticated]').waitFor();
    await p.locator('.hero-actions a').first().hover();
    const hero=await p.evaluate(()=>{
      const rest=document.querySelector('.hero-proof-meta .home-mobile-rest');
      return {rows:rest.getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth,
        widths:[...document.querySelectorAll('.hero-actions a')].map(el=>el.getBoundingClientRect().width)};
    });
    assert.equal(hero.rows,1);assert.ok(!hero.overflow);
    assert.ok(Math.max(...hero.widths)-Math.min(...hero.widths)<1);
    const heroRows=await p.locator('.hero-actions a').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));
    assert.ok(heroRows[1]>heroRows[0]&&heroRows[2]>heroRows[1]);
    assert.ok(hero.widths[0]>250);
    assert.equal(await p.locator('.site-account-link svg').count(),0);
    assert.ok(await p.locator('.site-account-label').isVisible());
    assert.ok(await p.locator('.sm-menu-label-short').isVisible());
    await p.locator('.sm-toggle').click();
    await p.waitForFunction(()=>document.querySelector('.staggered-menu-panel').getBoundingClientRect().right<=innerWidth);
    const menu=await p.locator('.staggered-menu-panel').evaluate(el=>({width:el.offsetWidth,x:el.getBoundingClientRect().x,
      font:parseFloat(getComputedStyle(el.querySelector('.sm-panel-item')).fontSize),gap:getComputedStyle(el.querySelector('.sm-panel-list')).gap}));
    assert.ok(menu.width<=178 && menu.x>0);assert.ok(Math.abs(menu.font-16.445)<.01);assert.equal(menu.gap,'5px');
    await p.keyboard.press('Escape');
    await p.locator('#about').scrollIntoViewIfNeeded();
    assert.equal(await p.locator('.home-about-quote').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),11.7);
    const join=p.locator('.home-explore-link--join');
    const icon=await join.locator('.home-explore-module-icon').boundingBox(),copy=await join.locator('.home-explore-link-copy').boundingBox();
    assert.ok(icon.x+icon.width<=copy.x);
    await p.locator('#directions').scrollIntoViewIfNeeded();
    const folderLayout=await p.locator('.home-explore-folder-frame').evaluateAll(els=>els.map(el=>({y:el.getBoundingClientRect().top,x:el.getBoundingClientRect().left})));
    assert.ok(Math.abs(folderLayout[0].y-folderLayout[1].y)<1 && folderLayout[1].x>folderLayout[0].x);
    assert.equal(await p.locator('.home-explore-resources .home-explore-module-icon:visible').count(),0);
    await p.locator('#research').scrollIntoViewIfNeeded();
    assert.ok(Math.abs(await p.locator('.research-section__wall').evaluate(el=>el.offsetHeight)-304.0128)<1);
    await p.locator('#partners').scrollIntoViewIfNeeded();
    await p.locator('.logo-marquee__heading').first().waitFor();
    assert.ok(await p.locator('.logo-marquee__heading').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)<=12));
    await p.locator('#cooperation').scrollIntoViewIfNeeded();
    await p.locator('.branch-atlas__school-row').first().waitFor();
    assert.ok(await p.locator('.branch-atlas__school-row').first().evaluate(el=>el.offsetHeight<80));
    assert.ok(await p.locator('.branch-atlas__panel').evaluate(el=>el.offsetHeight<650));
    const list=await p.locator('.branch-atlas__school-list').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,row:el.firstElementChild.getBoundingClientRect().height}));
    assert.ok(list.height<=list.row*4+1);assert.ok(list.scroll>list.height);
    const branchSearch=p.locator('.branch-atlas__toolbar').getByRole('button',{name:'搜索分社或高校',exact:true});
    await branchSearch.click();const search=p.getByRole('searchbox',{name:'搜索分社或高校',exact:true});
    const searchDialog=p.getByRole('dialog',{name:'搜索分社或高校',exact:true});
    await search.fill('福建师范大学');await search.press('ArrowDown');
    assert.equal(await searchDialog.count(),1);
    assert.ok(await searchDialog.locator('.branch-atlas__school-row').first().evaluate(node=>node===document.activeElement));
    await searchDialog.locator('.branch-atlas__school-row').first().click();
    await p.locator('.branch-atlas__school-heading').getByRole('heading',{name:'福建师范大学',exact:true}).waitFor();

    await p.locator('#join').scrollIntoViewIfNeeded();
    await p.locator('.home-contact-mobile').waitFor();
    assert.equal(await p.locator('.home-contact-mobile').innerText(),'官方：零小一');
    await p.locator('.home-footer-inner').scrollIntoViewIfNeeded();
    await p.locator('.home-footer-logo-loop .logo-loop').waitFor();
    await p.waitForFunction(()=>{const image=document.querySelector('.home-footer-brand-logo');return image.complete && image.naturalWidth>0;});
    const brand=await p.locator('.home-footer-brand').boundingBox(),loop=await p.locator('.home-footer-logo-loop').boundingBox();
    assert.ok(loop.x>brand.x && Math.abs((brand.y+brand.height/2)-(loop.y+loop.height/2))<3);
    assert.ok(await p.locator('.home-footer-logo-loop svg').first().evaluate(el=>el.getBoundingClientRect().height<=36));
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await p.locator('.staggered-menu-wrapper').evaluate(el=>Number(el.style.getPropertyValue('--nav-glass-opacity'))===1));
    const blur=await p.locator('.sm-header-glass').evaluate(el=>({filter:getComputedStyle(el).backdropFilter,mask:getComputedStyle(el).maskImage,pointer:getComputedStyle(el).pointerEvents}));
    assert.ok(blur.filter.includes('blur') && blur.mask.includes('gradient'));assert.equal(blur.pointer,'none');
    await p.close();console.log('通过 手机首页紧凑排版、导航、文件夹、合作生态、分社、页脚及渐变模糊',width);
  }
  const desktop=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  desktop.on('pageerror',e=>errors.push(e.message));
  await desktop.route('**/api/community/session',r=>r.fulfill({json:{user:{id:'demo-player',name:'验收玩家',role:'player'}}}));
  await desktop.route('**/api/community/projects/campus-agent', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), demoUrl: 'https://example.test/project' } });
  });
  await desktop.goto(origin+'/plaza?project=campus-agent');
  const actions=desktop.locator('.detail-section-actions');
  await actions.getByRole('link',{name:'修改',exact:true}).waitFor();
  assert.ok(await actions.getByRole('link',{name:'项目',exact:true}).isVisible());
  const shape=el=>{const s=getComputedStyle(el);return [s.borderRadius,s.minHeight,s.padding]};
  assert.equal(await actions.getByRole('link',{name:'联系',exact:true}).count(),0);
  assert.deepEqual(await actions.getByRole('link',{name:'修改',exact:true}).evaluate(shape),await actions.getByRole('link',{name:'返回',exact:true}).evaluate(shape));
  await desktop.evaluate(()=>scrollTo(0,250));await desktop.waitForTimeout(200);
  assert.ok(await desktop.locator('.sm-header-glass').evaluate(el=>getComputedStyle(el).backdropFilter.includes('blur')));
  await desktop.close();
  assert.deepEqual(errors,[]);console.log('通过 项目操作按钮形状、文案和桌面顶部渐变模糊');
}finally{await browser.close()}
