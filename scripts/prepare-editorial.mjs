import { createServer } from 'vite';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contactQr } from '../src/data/community.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cacheDir = await mkdtemp(resolve(tmpdir(), '01player-editorial-'));
let server;
const sections=[];
const data={
  activityPhotos:['activity-photos','活动与时光机照片','/?page=time-machine'],
  competitionItems:['competition','科研与竞赛影像','/#research'], researchThemes:['research','科研方向','/?page=research'],
  branches:['branches','高校分社','/#cooperation'], businesses:['business','零一商业','/#business'], partners:['partners','合作品牌','/#partners'],
  mentors:['mentors','启航导师','/mentors'], leadership:['leadership','头号玩家','/leadership'], pioneers:['pioneers','先锋玩家','/pioneers'],
  projects:['projects','项目介绍','/?project=knowledge'], learningFolderItems:['explore','学习资源','/#directions'],practiceFolderItems:['explore','实践资源','/#directions'],
  socialChannels:['social','社交渠道','/#directions'], extraFooterLinks:['social','页脚链接与标识','/#join'], siteDestinations:['destinations','首页与分社服务链接','/'], menu:['menu','站点导航','/'], homeRegions:['regions','首页栏目顺序','/']
};
try {
 server = await createServer({root,configFile:false,cacheDir,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null},appType:'custom'});
 for(const [key,[file,title,path]] of Object.entries(data)){
   const mod=await server.ssrLoadModule('/src/data/'+file+'.js');
   sections.push({key,title,path,rows:mod[key==='homeRegions'?'regionDefaults':key]});
 }
 const copyGroups=[
 ['home','首页与加入方式',['App.jsx','components/ExploreSection.jsx','components/ResearchSection.jsx','components/ExploreEntry.jsx','components/SiteNavigation.jsx','components/BranchAtlas.jsx'],'/'],
 ['people','成员与团队',['LeadershipPage.jsx','MentorsPage.jsx','PioneersPage.jsx','components/TeamShowcase.jsx','components/DuotoneTeamRoster.jsx','components/PioneerSearch.jsx'],'/team'],
 ['archive','时光机与项目页',['time-machine/TimeMachinePage.jsx','time-machine/EventAlbums.jsx','ProjectPage.jsx','ResearchPage.jsx'],'/?page=time-machine']
 ];
 const assigned = new Set();
 for (const [key,title,files,path] of copyGroups) {
   const keys=new Set();
   for (const file of files) {
     const src=await readFile(resolve(root,'src',file),'utf8');
     for(const m of src.matchAll(/\bt\(\s*(["'])([^'"\n]+)\1\s*[,)]/g)) keys.add(m[2].trim());
     for(const m of src.matchAll(/(?:title|description|label|name):\s*['"]([^'"\n]*[\u4e00-\u9fff][^'"\n]*)['"]/g)) keys.add(m[1]);
     for(const m of src.matchAll(/const SLOGAN(?:_EN)? = '([^']+)'/g))keys.add(m[1]);
   }
   sections.push({key:'copy-'+key,title:title+'文案',path,rows:[...keys].filter(source=>!assigned.has(source)).map(source=>{ assigned.add(source); return {source,zh:'',hant:'',en:''}; })});
 }
 const dictionary = JSON.parse(await readFile(resolve(root,'src/i18n/en.json'),'utf8'));
 const shared = Object.keys(dictionary).filter(source=>!assigned.has(source) && /[\u4e00-\u9fff]/.test(source));
 sections.push({key:'copy-interface',title:'全站通用文案',path:'/',rows:shared.map(source=>({source,zh:'',hant:'',en:''}))});
 const brandAssets = [
   ['/images/club-logo-black.svg','浅色导航的方形 Logo'], ['/images/club-logo-white.svg','深色导航的方形 Logo'],
   ['/images/club-logo-horizontal-black.svg','浅色横版品牌标识'], ['/images/club-logo-horizontal-white.svg','深色横版品牌标识'],
   ['join-qq','加入 · QQ 社区群二维码'], ['join-wechat','加入 · 微信公众号二维码'], [contactQr.assetKey,'加入 · 官方合作二维码',contactQr.image],
   ['/lingyi-logo.jpg','页面加载标识'], ['/images/lingyiyang-logo.jpg','零一扬标识'], ['/images/feishu-logo.png','飞书标识'], ['/images/qq-logo.png','QQ 标识'],
 ];
 sections.push({key:'siteAssets',title:'全站公共标识与二维码',path:'/#join',rows:brandAssets.map(([id,title,url=id])=>({id,title,url}))});
 sections.push({key:'earthGuide',title:'地球生存攻略',path:'/earth',rows:JSON.parse(await readFile(resolve(root,'cms/src/content/earth-guide-seed.json'),'utf8'))});
 const file=resolve(root,'cms/src/content/catalog.json');
 await mkdir(dirname(file),{recursive:true}); await writeFile(file,JSON.stringify(sections,null,2)+'\n');
} finally {
 try { await server?.close(); }
 finally { await rm(cacheDir,{recursive:true,force:true}); }
}
