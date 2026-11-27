import { useState } from 'react';
import SpecularButton from '../SpecularButton';
import { communityApi } from '../community/api';

export default function EventAlbums({ albums, eventId, onSelect, admin, onSaved, loading, error, retry }) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const album=albums.find(item=>item.eventId===eventId);
  return <section className="tm-albums" aria-label="活动专题照片库">
    <label className="tm-album-select"><span>活动专题</span><select value={eventId} onChange={e=>{setMessage('');onSelect(e.target.value);}}><option value="">全部影像</option>{albums.map(item=><option key={item.id} value={item.eventId}>{item.name}{item.example?'（示例）':''} · {item.photos.length} 张</option>)}</select></label>
    {loading && <p role="status">正在加载活动专题…</p>}
    {error && <p role="alert">{error} <button onClick={retry}>重试</button></p>}
    {!loading&&!error&&!albums.length&&<p>新的活动开始后，对应的专题会出现在这里。</p>}
    {eventId&&!album&&!loading&&!error&&<p role="status">该活动尚未开始或不存在，暂时没有专题照片库。</p>}
    {album&&<div className="tm-album-detail"><h2>{album.name}</h2><p>{album.type} · {album.date} · {album.status==='ended'?'已结束':album.status==='active'?'进行中':'报名中'}</p><p>{album.description}</p><span>{album.photos.length} 张照片 · {album.projectCount} 个公开作品</span>
      {admin&&<details><summary>添加本场照片</summary><form className="tm-photo-form" onSubmit={async e=>{
        e.preventDefault();const form=e.currentTarget;if(busy)return;setBusy(true);setMessage('');
        try{await communityApi('photos',{...Object.fromEntries(new FormData(form)),eventId:album.eventId});form.reset();setMessage('照片已加入本场专题。');await onSaved();}catch(err){setMessage(err.message);}finally{setBusy(false);}
      }}><label>照片说明<input name="title" required maxLength={250} /></label><label>照片链接<input name="imageUrl" required placeholder="https://… 或已有 /images/… 路径" maxLength={2000} /></label><label>分类<select name="category"><option value="activity">活动照片</option><option value="competition">比赛现场</option><option value="certificate">获奖记录</option></select></label><label>摄影署名（选填）<input name="credit" maxLength={100} /></label><p>请使用已获授权、可公开展示的图片。照片会公开到本活动专题。</p><SpecularButton size="md" type="submit" disabled={busy}>{busy?'正在保存…':'添加照片'}</SpecularButton></form></details>}
      {message&&<p role="status">{message}</p>}
    </div>}
  </section>;
}
