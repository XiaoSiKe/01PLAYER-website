'use client';
import React, { useEffect, useState } from 'react';
import { useDocumentInfo } from '@payloadcms/ui';
export default function Usage() {
  const { id } = useDocumentInfo();
  const [text, setText] = useState('');
  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch('/cms-api/media-usage/' + id)
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((list) => {
        if (active) setText(list.length ? list.join('、') : '当前没有页面引用');
      })
      .catch(() => {
        if (active) setText('暂时无法核对引用');
      });
    return () => {
      active = false;
    };
  }, [id]);
  return id ? (
    <div className="op-field">
      <strong>引用位置</strong>
      <p>{text || '正在查询…'}</p>
    </div>
  ) : null;
}
