import { validateGuide } from '../../../server/guide-content.mjs';
export const labels = {
  name:'名称', title:'标题', role:'职务', description:'介绍', summary:'摘要', image:'图片', fullImage:'高清原图',
  photo:'照片', src:'图片', href:'链接', url:'地址', link:'链接', label:'导航文字', alt:'图片说明', ariaLabel:'辅助说明',
  university:'学校', joinedAt:'加入日期', organization:'组织或系列', credit:'署名', subtitle:'副标题', category:'分类',
  school:'学校', shortName:'简称', leader:'负责人', avatar:'头像', address:'地址', campus:'校区', crest:'校徽', flag:'社旗',
  website:'学校官网', founding:'创立信息', founded:'成立日期', source:'当前原文', zh:'简体中文', hant:'繁體中文',
  en:'English', text:'正文', verb:'动作', members:'项目成员', participants:'署名成员', tags:'标签', features:'项目特点',
  english:'英文名', detail:'详情', homepage:'个人主页', darkSrc:'深色主题素材', imageAlt:'图片说明', kind:'影像类型',
  body:'正文段落', searchTerms:'搜索词', date:'日期', city:'所在城市', coordinates:'地图坐标', number:'展示编号',
  captionCredit:'项目署名', excerpt:'摘要', visible:'在首页显示', demo:'示例项目', isExample:'示例内容',
  qr:'二维码', memberId:'关联名册成员', id:'固定标识', width:'宽度', height:'高度', type:'类型',
};
export const mediaFields = new Set(['src','darkSrc','image','fullImage','photo','avatar','crest','flag','qr']);
const linkFields = new Set(['link','url','href','website','homepage','addressSource']);
export const listTemplates = { members:{memberId:'',name:'',src:'',href:''}, participants:'', tags:'', features:['',''], body:'' };
export const options = {
  'partners.category': [['community','社区与机构'],['hackathon','黑客松'],['university','高校组织']],
  'competitionItems.kind': [['photo','比赛现场'],['certificate','获奖证书']],
  'branches.city': [['fuzhou','福州'],['quanzhou','泉州']],
};
const folders = {id:'',title:'',href:''};
const profile = {id:'',name:'',university:'',joinedAt:'',photo:'',href:''};
export const templates = {
  activityPhotos:{id:'',title:'',organization:'',src:'',alt:'',width:1200,height:800},
  competitionItems:{id:'',title:'',kind:'photo',image:'',fullImage:'',participants:[],credit:'',aspectRatio:1.5},
  researchThemes:{id:'',title:'',text:'',verb:''},
  branches:{id:'',name:'',school:'',shortName:'',role:'分社',city:'fuzhou',founded:'',campus:'',description:'',address:'',website:'',crest:'',flag:'',searchTerms:'',leader:{memberId:'',name:'',title:'分社长',avatar:''}},
  businesses:{id:'',title:'',subtitle:'',src:'',alt:'',href:'',captionCredit:'',members:[]},
  partners:{id:'',name:'',category:'community',src:'',darkSrc:'',href:'',width:128,height:64},
  mentors:{id:'',name:'',role:'',description:'',image:'',homepage:''},
  leadership:{...profile,role:''}, pioneers:profile,
  projects:{id:'',number:'',name:'',image:'',english:'',category:'',description:'',detail:'',tags:[],features:[],url:'',demo:false},
  learningFolderItems:folders,practiceFolderItems:folders,socialChannels:folders,extraFooterLinks:{...folders,image:''},
  menu:{id:'',label:'',ariaLabel:'',link:''}, siteDestinations:folders,
  homeRegions:{id:'',title:'',visible:true}, siteAssets:{id:'',title:'',url:''},
  communityMoments:{id:'',title:'',category:'',description:'',image:'',imageAlt:'',isExample:false},
  communityPublications:{id:'',title:'',category:'',excerpt:'',url:'',body:[],isExample:false},
};
export const copyTemplate = {source:'',zh:'',hant:'',en:''};
const required = {
  activityPhotos:['title','src'],competitionItems:['title','image'],researchThemes:['title'],
  branches:['school','name','shortName','city'],businesses:['title','src'],partners:['name','src'],
  mentors:['name'],leadership:['name'],pioneers:['name'],projects:['name'],
  learningFolderItems:['title','href'],practiceFolderItems:['title','href'],socialChannels:['title'],extraFooterLinks:['title'],
  menu:['label','link'],siteDestinations:['href'],communityMoments:['title','image'],communityPublications:['title'],
};
export function templateFor(section) {
  return section?.startsWith('copy-') ? copyTemplate : templates[section];
}
export function isFixedSection(section) {
  return section?.startsWith('copy-') || ['siteAssets','homeRegions','siteDestinations'].includes(section);
}
export function validUrl(value, media = false) {
  if (typeof value !== 'string' || /[\\\x00-\x1f\x7f]/.test(value)) return false;
  if (!value) return true;
  if (value.trim() !== value || value.startsWith('//')) return false;
  if (/^(?:\/|\.\/|#|\?)/.test(value)) {
    try { const url = new URL(value,'https://site.invalid'); return url.origin === 'https://site.invalid'; } catch { return false; }
  }
  try {
    const url = new URL(value);
    return !url.username && !url.password && (['https:','http:'].includes(url.protocol) || (!media && ['mailto:','tel:'].includes(url.protocol)));
  } catch { return false; }
}
export function validateRows(rows, section, defaults) {
  if (section === 'earthGuide') return validateGuide(rows);
  const shape = templateFor(section);
  if (!shape || !Array.isArray(rows) || rows.length > 1000) return '栏目条目格式无效。';
  const allowed = defaults && isFixedSection(section) ? new Set(defaults.map(row => row.id || row.source)) : null;
  const seen = new Set();
  function check(v,k,depth) {
    if (depth>8 || ['__proto__','constructor','prototype'].includes(k)) throw Error('字段层级或名称无效。');
    if(v == null || typeof v==='boolean')return;
    if(typeof v==='number'){if(!Number.isFinite(v))throw Error('数值无效。');return;}
    if(typeof v==='string'){
      if(v.length>16000)throw Error('文字超出字段上限。');
      const media=mediaFields.has(k)||(section==='siteAssets'&&k==='url');
      if((media||linkFields.has(k))&&!validUrl(v,media)&&!(section==='siteAssets'&&['join-qq','join-wechat'].includes(v))) throw Error('请填写有效链接，或从素材库选择图片。');
      return;
    }
    if(typeof v!=='object' || (Array.isArray(v)&&v.length>500))throw Error('字段内容无效。');
    for(const [key,val] of Object.entries(v))check(val,key,depth+1);
  }
  try {
    for (const [index,row] of rows.entries()) {
      if (!row || Array.isArray(row) || typeof row!=='object') throw Error('条目格式无效。');
      const identity=row.id || row.source || (section==='menu' ? row.label : section==='researchThemes' ? row.title : null);
      if(!identity || typeof identity!=='string' || seen.has(identity))throw Error('条目标识缺失或重复。');
      if (allowed && !allowed.has(identity)) throw Error('本栏目的固定条目标识无效。');
      seen.add(identity); check(row,'',0);
      if (row.id && section !== 'siteAssets' && !/^[a-z0-9_-]{1,120}$/i.test(row.id)) throw Error('固定标识格式无效。');
      for (const field of required[section]||[]) {
        if (typeof row[field]!=='string' || !row[field].trim()) throw Error('第 '+(index+1)+' 项需要填写“'+(labels[field]||field)+'”。');
      }
      for (const [key,defaultValue] of Object.entries(shape)) {
        const value=row[key]; if(value==null)continue;
        if(Array.isArray(defaultValue)){
          if(!Array.isArray(value))throw Error('列表字段格式无效。');
          if(key==='features'&&value.some(part=>!Array.isArray(part)||part.length!==2||part.some(t=>typeof t!=='string')))throw Error('每个项目特点需要标题和说明。');
          if(['tags','participants','body'].includes(key)&&value.some(t=>typeof t!=='string'))throw Error('列表内容需要填写文字。');
          if(key==='members'&&value.some(m=>!m||typeof m.name!=='string'||!m.name.trim()||['memberId','src','href'].some(k=>m[k]!=null&&typeof m[k]!=='string')))throw Error('每位项目成员需要有效的姓名与资料。');
        } else if (typeof value!==typeof defaultValue) throw Error('字段“'+(labels[key]||key)+'”格式无效。');
        const choices=options[section+'.'+key];if(choices&&!choices.some(([id])=>id===value))throw Error('请选择有效的'+labels[key]+'。');
      }
      if(row.leader && ['memberId','name','title','avatar'].some(k=>row.leader[k]!=null && typeof row.leader[k]!=='string'))throw Error('负责人资料格式无效。');
      if(row.founded && !/^\d{4}-\d\d-\d\d$/.test(row.founded))throw Error('请选择完整成立日期。');
    }
    return true;
  } catch(err) { return err.message; }
}

// Keep drafts, order, removals and operator overrides. New immutable slots are appended.
export function mergeCatalogDefaults(section, current, defaults) {
  if (!Array.isArray(current)) return structuredClone(defaults);
  const identity = row => row.id || row.source || (section==='menu' ? row.label : section==='researchThemes' ? row.title : '');
  const originals = new Map(defaults.map(row=>[identity(row),row]));
  const previouslyUnkeyed = new Map(defaults.map(row=>[section==='menu' ? row.label : row.title,row]));
  const seen=new Set();
  const rows=current.map(row=>{
    const original=originals.get(identity(row)) || (!row.id && ['menu','researchThemes'].includes(section) ? previouslyUnkeyed.get(identity(row)) : null);
    if(!original) return row;
    seen.add(identity(original));
    return {...original,...row};
  });
  if(isFixedSection(section))for(const entry of defaults)if(!seen.has(identity(entry)))rows.push({...entry});
  return rows;
}
