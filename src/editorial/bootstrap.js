async function start() {
  const preview = new URLSearchParams(location.search).get('editPreview');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), preview ? 12000 : 1100);
  const target = preview ? '/cms-api/site-preview?key=' + encodeURIComponent(preview) : '/site-content/manifest.json';
  try {
    const response = await fetch(target, { credentials:'same-origin', signal:controller.signal });
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const content = await response.json();
      if (!content || !content.sections || typeof content.sections !== 'object') throw Error('栏目内容暂时无法读取。');
      globalThis.__clubContent=content;
    } else if (preview) throw Error('请先登录运营后台，再打开草稿预览。');
  } catch (error) {
    if (preview) {
      document.getElementById('root').textContent = error.name==='AbortError' ? '预览连接超时，请刷新重试。' : error.message;
      return;
    }
  } finally { clearTimeout(timeout); }
  await import('../main.jsx');
}
start();
