'use client';
import { Action } from './OfficialUI';
import React, { useEffect, useMemo, useState } from 'react';
import { useField, useFormFields } from '@payloadcms/ui';
import { isFixedSection, labels, listTemplates, mediaFields, options, templateFor } from '../content/rules.mjs';

export function MediaPicker({ onChoose, onClose }) {
  const [items,setItems] = useState([]), [query,setQuery] = useState(''), [page,setPage] = useState(1);
  const [more,setMore] = useState(false), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({limit:'16',page:String(page),sort:'-createdAt'});
    if (query.trim()) params.set('where[alt][like]',query.trim());
    setError(''); setLoading(true);
    fetch('/cms-api/media?'+params,{signal:controller.signal}).then(async response => {
      if (!response.ok) throw Error('素材加载失败，请重新打开素材库。');
      const data=await response.json(); setItems(data.docs); setMore(data.hasNextPage);
    }).catch(err=>{ if (!controller.signal.aborted) setError(err.message); })
      .finally(()=>{ if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query,page]);
  return <div className="asset-picker" role="region" aria-label="选择素材">
    <div className="op-line"><input aria-label="搜索素材说明" placeholder="搜索素材说明" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} />
      <Action type="button" onClick={onClose}>关闭</Action></div>
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">正在加载素材…</p>
      : <div className="asset-grid">{items.map(item=><Action type="button" key={item.id} onClick={()=>onChoose(item)}>
        <img src={item.sizes?.thumb?.url || item.url} alt="" /><span>{item.alt || item.filename}</span></Action>)}</div>}
    {!loading && !error && !items.length && <p>没有匹配素材，可以先上传图片。</p>}
    <div className="op-line"><Action type="button" disabled={page===1 || loading} onClick={()=>setPage(page-1)}>上一页</Action>
      <Action type="button" disabled={!more || loading} onClick={()=>setPage(page+1)}>下一页</Action>
      <a href="/admin/collections/media/create" target="_blank" rel="noreferrer">上传素材 ↗</a></div>
  </div>;
}

const hidden = new Set(['id','width','height','aspectRatio']);
const emptyRows = [];
const longFields = new Set(['text','detail','description','intro','body','zh','hant','en']);
const rowName = row => row.name || row.title || row.label || row.source || row.id || '未命名条目';
const swap = (list,a,b) => { const next=[...list]; [next[a],next[b]]=[next[b],next[a]]; return next; };
const changeAt = (list,index,value) => list.map((entry,i)=>i===index ? value : entry);
const fieldLabel = key => labels[key] || key;

function EditableList({ field,value,onChange,section }) {
  const specimen = listTemplates[field];
  return <fieldset><legend>{fieldLabel(field)}</legend>
    {value.map((item,index)=><div key={index} className="editor-row">
      <div className="op-line"><b>{field==='members' ? item.name || '新成员' : field==='features' ? item[0] || '新特点' : '第 '+(index+1)+' 项'}</b><span />
        <Action type="button" disabled={!index} aria-label="向前移动" onClick={()=>onChange(swap(value,index,index-1))}>↑</Action>
        <Action type="button" disabled={index===value.length-1} aria-label="向后移动" onClick={()=>onChange(swap(value,index,index+1))}>↓</Action>
        <Action type="button" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>移除</Action></div>
      {typeof item==='string' ? <label className="op-field community-field">内容<input value={item} onChange={e=>onChange(changeAt(value,index,e.target.value))}/></label>
        : Array.isArray(item) ? item.map((text,part)=><label key={part} className="op-field">{part ? '说明' : '标题'}
          <input value={text} onChange={e=>onChange(changeAt(value,index,changeAt(item,part,e.target.value)))} /></label>)
        : <ObjectFields section={section} shape={specimen} value={item} onChange={next=>onChange(changeAt(value,index,next))}/>}
    </div>)}
    <Action type="button" onClick={()=>onChange([...value,structuredClone(specimen)])}>{field==='members' ? '添加成员' : field==='features' ? '添加特点' : '添加一项'}</Action>
  </fieldset>;
}

function EditorField({ section,field,value,onChange,onMedia,label=fieldLabel(field),readOnly=false }) {
  const [picker,setPicker] = useState(false);
  if (Array.isArray(value)) return <EditableList section={section} field={field} value={value} onChange={onChange}/>;
  if (value && typeof value==='object') return <fieldset><legend>{label}</legend>
    <ObjectFields section={section} shape={section==='branches' && field==='leader' ? templateFor('branches').leader : value} value={value} onChange={onChange}/></fieldset>;
  if (typeof value==='boolean') return <label className="op-field community-field"><span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/> {label}</span></label>;
  const choices=options[section+'.'+field];
  if (choices) return <label className="op-field community-field">{label}<select value={value} onChange={e=>onChange(e.target.value)}>
    {choices.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>;
  const media=mediaFields.has(field) || section==='siteAssets'&&field==='url';
  const long=longFields.has(field)||field==='source'||String(value||'').length>120&&!media;
  return <div className="op-field"><label className="community-field">{label}
    {long ? <textarea value={value??''} rows={3} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/>
      : <input value={value??''} type={['joinedAt','founded'].includes(field)?'date':'text'} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/>}</label>
    {media && <><div className="op-line">
      {value && /^(?:https?:|\/)/.test(value) && <img src={value} alt="当前素材" width="64" height="48" style={{objectFit:'contain'}}/>}
      <Action type="button" onClick={()=>setPicker(!picker)}>从素材库选择</Action></div>
      {picker && <MediaPicker onClose={()=>setPicker(false)} onChoose={item=>{onMedia ? onMedia(item) : onChange(item.url);setPicker(false);}}/>}</>}
  </div>;
}

function MemberField({ value, onChange }) {
  const [active, setActive] = useState(false), [members, setMembers] = useState([]), [error,setError] = useState('');
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const params = new URLSearchParams({'where[sectionKey][in]':'pioneers,leadership', limit:'2', draft:'true'});
    fetch('/cms-api/sections?'+params,{signal:controller.signal}).then(async response => {
      if (!response.ok) throw Error('成员名单暂时无法读取。');
      const {docs} = await response.json();
      const profiles = new Map();
      for (const section of docs.sort((a,b)=>Number(b.sectionKey==='leadership')-Number(a.sectionKey==='leadership'))) {
        for (const person of section.rows) profiles.set(person.id,{...profiles.get(person.id),...person,team:section.sectionKey==='leadership'||profiles.get(person.id)?.team});
      }
      setMembers([...profiles.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hans')));
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return () => controller.abort();
  },[active]);
  return <div className="op-field"><span>关联名册成员</span>
    {active ? <label className="community-field">选择成员<select aria-label="选择名册成员" value={value} onChange={event=>onChange(members.find(entry=>entry.id===event.target.value))}>
      <option value="">自行填写</option>
      {members.map(entry=><option key={entry.id} value={entry.id}>{entry.name} · {entry.university || '零一玩家'}</option>)}
    </select></label> : <Action type="button" onClick={()=>setActive(true)}>{value ? '更换关联成员' : '从成员名册选择'}</Action>}
    {error && <span role="alert">{error}</span>}
  </div>;
}

function ObjectFields({ section,shape,value,onChange }) {
  return Object.entries(shape).filter(([field])=>!hidden.has(field)).map(([field,initial])=>{
    const selected=value[field]??initial;
    if (field==='memberId') return <MemberField key={field} value={selected} onChange={member=>{
      if (!member) {onChange({...value,memberId:''});return;}
      const next={...value,memberId:member.id,name:member.name};
      if ('avatar' in shape) next.avatar=member.photo || '';
      if ('src' in shape) {
        next.src=member.photo || '';
        next.href=(member.team?'/team':'/pioneers')+'?member='+encodeURIComponent(member.id);
      }
      onChange(next);
    }}/>;
    const readOnly=field==='source'||field==='title'&&isFixedSection(section);
    const mediaUpdate = asset => {
      const updated={...value,[field]:asset.url};
      if (section==='activityPhotos' && field==='src') { updated.width=asset.width;updated.height=asset.height; if(!value.alt)updated.alt=asset.alt; }
      if (section==='competitionItems' && field==='image') {
        updated.fullImage=asset.url;
        if(asset.width && asset.height){updated.aspectRatio=asset.width/asset.height;updated.fullAspectRatio=updated.aspectRatio;updated.orientation=asset.width>asset.height?'landscape':'portrait';}
      }
      if (section==='partners' && (field==='src'||field==='darkSrc')) {
        updated.artwork=null;updated.crop=null;
      }
      if (field==='photo') updated.photoPlaceholder=false;
      onChange(updated);
    };
    return <EditorField key={field} section={section} field={field} value={selected} readOnly={readOnly}
      onChange={next=>onChange({...value,[field]:next})} onMedia={mediaUpdate}/>;
  });
}

export default function RowsField({ path }) {
  const {value:raw,setValue} = useField({path});
  const section = useFormFields(([fields])=>fields.sectionKey?.value);
  const [search,setSearch] = useState(''), [open,setOpen] = useState(null), [page,setPage] = useState(0);
  const rows=Array.isArray(raw)?raw:emptyRows, shape=templateFor(section);
  const query=search.trim().toLowerCase();
  const matches=useMemo(() => rows.map((row,index)=>({row,index}))
    .filter(({row})=>!query || JSON.stringify(row).toLowerCase().includes(query)), [rows, query]);
  if(!shape) return <p>正在读取栏目…</p>;
  const fixed=isFixedSection(section);
  const pageSize=25;
  const pageCount=Math.max(1,Math.ceil(matches.length/pageSize));
  const currentPage=Math.min(page,pageCount-1);
  const shown=matches.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  const reorder=!fixed || section==='homeRegions';
  const entryKey=(row,i)=>row.id||row.source||i;
  const add=()=>{
    const fresh=structuredClone(shape);
    fresh.id='item-'+crypto.randomUUID();
    setValue([...rows,fresh]);setOpen(fresh.id);setSearch('');setPage(Math.floor(rows.length/pageSize));
  };
  return <div className="rows-editor">
    {section==='activityPhotos' && <p>前 16 张进入首页照片隧道，所有照片同时收录到时光机。</p>}
    {section==='homeRegions' && <p>上下移动栏目可调整首页顺序，关闭显示可暂时隐藏栏目。</p>}
    {section==='branches' && <p>新分社可在目录内查看资料，已有地图轮廓沿用原校区。</p>}
    <div className="op-line"><input aria-label="查找条目" placeholder="搜索标题、名称或原文" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} />
      {!fixed && <Action type="button" onClick={add}>添加条目</Action>}</div>
    {!shown.length && <p role="status">{query ? '没有匹配的条目。' : '本栏目还没有条目。'}</p>}
    {shown.map(({row,index:i})=>{
      const id=entryKey(row,i);
      return <div className="editor-row" key={id}><div className="op-line">
        <button type="button" aria-expanded={open===id} onClick={()=>setOpen(open===id ? null : id)}>{rowName(row)}</button><span />
        {reorder&&<><Action type="button" disabled={!i} aria-label="上移" onClick={()=>setValue(swap(rows,i,i-1))}>↑</Action>
          <Action type="button" disabled={i===rows.length-1} aria-label="下移" onClick={()=>setValue(swap(rows,i,i+1))}>↓</Action></>}</div>
        {open===id && <div className="row-fields"><ObjectFields section={section} shape={shape} value={row} onChange={next=>setValue(changeAt(rows,i,next))}/>
          {section==='siteAssets' && row.url!==row.id && <Action type="button" onClick={()=>setValue(changeAt(rows,i,{...row,url:row.id}))}>恢复官网原图</Action>}
          {!fixed&&<Action type="button" onClick={()=>{if(window.confirm('从此栏目移除“'+rowName(row)+'”？保存草稿后可预览更改。')){setValue(rows.filter((_,n)=>n!==i));setOpen(null);}}}>从栏目移除</Action>}</div>}
      </div>;
    })}
    {pageCount>1 && <div className="op-line"><Action type="button" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>上一页</Action>
      <span>{currentPage+1} / {pageCount} · {matches.length} 项</span>
      <Action type="button" disabled={currentPage+1>=pageCount} onClick={()=>setPage(currentPage+1)}>下一页</Action></div>}
  </div>;
}
