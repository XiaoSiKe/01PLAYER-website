'use client';
import React from 'react';
import {useFormFields} from '@payloadcms/ui';

export default function Preview() {
  const key=useFormFields(([fields])=>fields.sectionKey?.value);
  const path=useFormFields(([fields])=>fields.previewPath?.value);
  if (!key || !path) return null;
  const url=new URL(path,'https://preview.invalid');
  url.searchParams.set('editPreview',key);
  return <div className="op-line">
    <a href={url.pathname+url.search+url.hash} target="_blank" rel="noreferrer">预览已保存的草稿 ↗</a>
    <a href={'/admin/content-preview?key='+encodeURIComponent(key)} target="_blank" rel="noreferrer">手机尺寸预览 ↗</a>
  </div>;
}
