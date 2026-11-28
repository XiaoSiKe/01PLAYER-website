import { useState } from 'react';
import { PROJECT_IMAGE_LIMIT } from '../../../server/project-images-limit.js';
import './project-images.css';

async function prepareImage(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024)
    throw Error('请选择不超过 15 MB 的 JPG、PNG 或 WebP 图片。');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = source; await image.decode();
    const ratio = Math.min(1,1600 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1,Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d',{alpha:false});
    context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.85,.7,.55,.4]) {
      const data = canvas.toDataURL('image/jpeg',quality);
      if (data.length <= PROJECT_IMAGE_LIMIT) return data;
    }
    throw Error('图片细节过多，请缩小图片后重新上传。');
  } finally { URL.revokeObjectURL(source); }
}

const identity = value => value;

function ImageSlot({ label, value, onChange, wide = false, staffPreview = false, t = identity, required = false }) {
  const [error,setError] = useState(''),[busy,setBusy] = useState(false);
  return <div className={'project-image-slot'+(wide ? ' project-image-slot--wide' : '')}>
    <label><span className="project-image-label"><span>{t(label)}</span><small>{t(required ? '必选' : '选填')}</small></span><span className="project-image-preview">
      {value ? <img src={staffPreview ? value.replace(/^\/api\/community\/project-media\//,'/cms-api/project-media/') : value} alt={t(label)+t('预览')} /> : <span>{t('选择图片')}</span>}
    </span><input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t(label)} required={required && !value} onChange={async event => {
      const input = event.currentTarget, file = input.files[0];
      if (!file) return;
      setError('');setBusy(true);input.setCustomValidity('图片正在处理，请稍候。');
      try { onChange(await prepareImage(file)); }
      catch (reason) {setError(reason.message);}
      finally {input.value='';input.setCustomValidity('');setBusy(false);}
    }} /></label>
    <div className="project-image-controls"><span>{t(busy ? '正在处理…' : wide ? '建议使用横版图片' : '建议使用方形图片')}</span>
      {value && <button type="button" onClick={() => onChange('')}>{t('移除')}</button>}</div>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export default function ProjectImageFields({ value, staffPreview = false, onDirty, t = identity }) {
  const initial = value || {};
  const [cover,setCover] = useState(initial.imageUrl || '');
  const [banner,setBanner] = useState(initial.bannerUrl || '');
  const [showcase,setShowcase] = useState(() => {
    try {return typeof initial.showcaseImages === 'string' ? JSON.parse(initial.showcaseImages) : initial.showcaseImages || [];}
    catch {return [];}
  });
  return <fieldset className="project-image-fields">
    <legend>{t('项目图片')}</legend>
    <input type="hidden" name="imageUrl" value={cover} />
    <input type="hidden" name="bannerUrl" value={banner} />
    <input type="hidden" name="showcaseImages" value={JSON.stringify(showcase.filter(Boolean))} />
    <div className="project-image-pair"><ImageSlot t={t} staffPreview={staffPreview} label="卡片封面" required value={cover} onChange={value => {setCover(value);onDirty?.();}} />
      <ImageSlot t={t} staffPreview={staffPreview} label="项目横幅" required value={banner} onChange={value => {setBanner(value);onDirty?.();}} wide /></div>
    <div className="project-image-pair">{[0,1].map(index => <ImageSlot key={index} t={t} staffPreview={staffPreview} label={'作品展示图 '+(index+1)} value={showcase[index]} wide onChange={value => {onDirty?.();setShowcase(current => {
      const next=[...current];next[index]=value;return next;
    });}} />)}</div>
  </fieldset>;
}
