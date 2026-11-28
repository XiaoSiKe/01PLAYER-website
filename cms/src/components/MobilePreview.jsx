'use client';
import { Action, DeskBack, DeskTitle } from './OfficialUI';
import React, { useEffect, useState } from 'react';
export default function MobilePreview() {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const key = new URLSearchParams(location.search).get('key');
    if (!key) {
      setError('缺少要预览的栏目。请返回网站内容选择栏目。');
      return;
    }
    const request = new AbortController();
    setError('');
    const query = new URLSearchParams({ 'where[sectionKey][equals]': key, limit: '1', depth: '0' });
    fetch('/cms-api/sections?' + query, { signal: request.signal })
      .then(async (response) => {
        if (response.status === 403 || response.status === 401)
          throw Error('登录已失效，请重新登录运营后台。');
        if (!response.ok) throw Error('暂时无法读取草稿，请重试。');
        const doc = (await response.json()).docs?.[0];
        if (!doc?.previewPath) throw Error('找不到这个栏目，请返回网站内容重新选择。');
        const dest = new URL(doc.previewPath, location.origin);
        dest.searchParams.set('editPreview', key);
        if (!request.signal.aborted) setUrl(dest.pathname + dest.search + dest.hash);
      })
      .catch((e) => {
        if (!request.signal.aborted) setError(e.message);
      });
    return () => request.abort();
  }, [attempt]);
  return (
    <main className="community-page op-shell">
      <DeskTitle title="手机预览">
        <DeskBack href="/admin/collections/sections" />
      </DeskTitle>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Action onClick={() => setAttempt((n) => n + 1)}>重新读取</Action>
        </div>
      ) : url ? (
        <iframe title="手机草稿预览" className="mobile-frame" src={url} />
      ) : (
        <p role="status">正在读取栏目草稿…</p>
      )}
    </main>
  );
}
