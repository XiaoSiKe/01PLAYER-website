'use client';
import { useDeskLanguage } from './DeskLanguage';
import React, { useEffect, useRef, useState } from 'react';
import { FiChevronRight, FiFileText, FiFolder, FiPlus } from 'react-icons/fi';
import { Action, DeskTitle } from './OfficialUI';
import './guide-editor.scss';

const makeId = prefix => prefix + crypto.randomUUID();
const move = (items, index, direction) => {
  const next = [...items];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
};
export default function GuideEditor() {
  const { t } = useDeskLanguage();
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const dirty = saved && JSON.stringify(rows) !== JSON.stringify(saved.rows);
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    function guard(event) {
      if (dirty || busy) { event.preventDefault(); event.returnValue = ''; }
    }
    function navigate(event) {
      if (!(dirty || busy) || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest('.nav a[href], .app-header a[href], .op-nav a[href]');
      if (anchor && anchor.target !== '_blank') { event.preventDefault(); event.stopPropagation(); window.location.assign(anchor.href); }
    }
    window.addEventListener('beforeunload', guard);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty, busy]);
  async function load() {
    if (pending.current) return;
    if (dirty && !window.confirm(t('重新加载会放弃当前未保存的更改，是否继续？'))) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/cms-api/guide', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '读取攻略失败。');
      setSaved(data); setRows(data.rows);
      setSelected(current => data.rows.some(group => group.id === current || group.chapters.some(article => article.id === current))
        ? current : data.rows[0]?.chapters[0]?.id ?? data.rows[0]?.id ?? null);
      setMessage('');
    } catch (error) { setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  async function save(status, preview = false) {
    if (pending.current || !saved) return;
    // Open on the click event so browsers allow the saved-draft preview tab.
    const tab = preview ? window.open('about:blank', '_blank') : null;
    if (tab) tab.opener = null;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/cms-api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-01-desk': '1' },
        body: JSON.stringify({ rows, revision: saved.revision, status }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '保存失败，请重试。');
      setSaved(data); setRows(data.rows);
      setMessage(status === 'published' ? '攻略已发布，官网内容已更新。' : '草稿已保存。');
      if (tab) tab.location = '/earth?editPreview=earthGuide' + (selected && !selected.startsWith('reading-') ? '#' + selected : '');
    } catch (error) { tab?.close(); setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  const groupIndex = rows.findIndex(group => group.id === selected || group.chapters.some(article => article.id === selected));
  const group = rows[groupIndex];
  const articleIndex = group?.chapters.findIndex(article => article.id === selected) ?? -1;
  const article = group?.chapters[articleIndex];
  function changeGroup(change) { setRows(current => current.map(item => item.id === group.id ? { ...item, ...change } : item)); }
  function changeArticle(change) { changeGroup({ chapters: group.chapters.map(item => item.id === article.id ? { ...item, ...change } : item) }); }
  function addGroup() {
    const next = { id: makeId('reading-'), title: t('新目录'), chapters: [] };
    setRows(current => [...current, next]); setSelected(next.id);
  }
  function addArticle() {
    const next = { id: makeId('article-'), title: t('新文章'), author: '', university: '', uploadedAt: new Date().toLocaleDateString('sv-SE'), body: '' };
    changeGroup({ chapters: [...group.chapters, next] }); setSelected(next.id);
  }
  return <main className="community-page op-shell guide-editor">
    <DeskTitle title="地球生存攻略">
      <div className="op-line guide-editor-actions">
        <Action disabled={busy || !saved} onClick={() => save('draft')}>{t('保存草稿')}</Action>
        <Action disabled={busy} onClick={load}>{t('重新加载')}</Action>
        <Action disabled={busy || !saved} onClick={() => save('draft', true)}>{t('预览草稿')}</Action>
        <Action className="guide-publish" disabled={busy || !saved} onClick={() => save('published')}>{t('发布攻略')}</Action>
      </div>
    </DeskTitle>
    {error ? <p className="guide-editor-feedback" role="alert">{t(error)}</p>
      : (busy || dirty || message) && <p className="guide-editor-feedback" role="status">
        {t(busy ? '处理中…' : dirty ? '有未保存的更改' : message)}
      </p>}
    {saved && <fieldset disabled={busy} className="guide-editor-workspace">
      <nav className="guide-editor-directory" aria-label={t("攻略目录编辑")}>
        <div className="guide-directory-head">
          <h2>{t('攻略目录')}</h2>
          <Action onClick={addGroup}><FiPlus aria-hidden="true" /> {t('添加目录')}</Action>
        </div>
        <div className="guide-directory-items">
          {rows.map(item => <section key={item.id}>
            <button type="button" className="guide-editor-group" aria-current={selected === item.id ? 'true' : undefined}
              aria-expanded={group?.id === item.id} onClick={() => setSelected(item.id)}>
              <FiFolder aria-hidden="true" /><span>{item.title || t('未命名目录')}</span><FiChevronRight aria-hidden="true" />
            </button>
            {group?.id === item.id && <div className="guide-directory-articles">
              {item.chapters.map(entry => <button type="button" key={entry.id}
                aria-current={selected === entry.id ? 'page' : undefined} onClick={() => setSelected(entry.id)}>
                <FiFileText aria-hidden="true" /><span>{entry.title || t('未命名文章')}</span>
              </button>)}
            </div>}
          </section>)}
        </div>
      </nav>
      <div className="guide-editor-content">
        {!group ? <p>{t("添加一个目录，开始编写攻略。")}</p> : <>
          <div className="guide-content-head">
            <div><p>{group.title}</p><h2>{article ? t('编辑文章') : t('编辑目录')}</h2></div>
            <Action onClick={addArticle}><FiPlus aria-hidden="true" /> {t('添加文章')}</Action>
          </div>
          {!article ? <>
            <label className="op-field community-field">{t("目录标题")}<input value={group.title} onChange={e => changeGroup({ title: e.target.value })} /></label>
            <div className="op-line">
              <Action disabled={groupIndex === 0} onClick={() => setRows(move(rows, groupIndex, -1))}>{t("目录上移")}</Action>
              <Action disabled={groupIndex === rows.length - 1} onClick={() => setRows(move(rows, groupIndex, 1))}>{t("目录下移")}</Action>
              <Action onClick={() => { if (window.confirm(t('移除「{0}」及其中的文章？', [group.title]))) { setRows(rows.filter(item => item.id !== group.id)); setSelected(null); } }}>{t("移除目录")}</Action>
            </div><p>{t("目录内第一篇文章为开篇，可通过文章上移、下移调整。")}</p>
          </> : <>
            <label className="op-field community-field">{t("文章标题")}<input value={article.title} onChange={e => changeArticle({ title: e.target.value })} /></label>
            <details className="guide-editor-article-details">
              <summary>{t('作者、日期与所属目录')}</summary>
              <div className="guide-editor-metadata">
              <label className="op-field community-field">{t("作者")}<input value={article.author} onChange={e => changeArticle({ author: e.target.value })} /></label>
              <label className="op-field community-field">{t("作者大学")}<input value={article.university} onChange={e => changeArticle({ university: e.target.value })} /></label>
              <label className="op-field community-field">{t("上传日期")}<input type="date" value={article.uploadedAt} onChange={e => changeArticle({ uploadedAt: e.target.value })} /></label>
              <label className="op-field community-field">{t("所属目录")}<select value={group.id} onChange={e => setRows(rows.map(item => item.id === group.id ? { ...item, chapters: item.chapters.filter(entry => entry.id !== article.id) } : item.id === e.target.value ? { ...item, chapters: [...item.chapters, article] } : item))}>{rows.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              </div>
            </details>
            <label className="op-field community-field">{t("Markdown 正文")}<textarea spellCheck={false} rows={22} value={article.body} onChange={e => changeArticle({ body: e.target.value })} placeholder={'## 二级标题\n\n在这里编写文章…'} /></label>
            <div className="op-line">
              <Action disabled={articleIndex === 0} onClick={() => changeGroup({ chapters: move(group.chapters, articleIndex, -1) })}>{t("文章上移")}</Action>
              <Action disabled={articleIndex === group.chapters.length - 1} onClick={() => changeGroup({ chapters: move(group.chapters, articleIndex, 1) })}>{t("文章下移")}</Action>
              <Action onClick={() => { if (window.confirm('移除「' + article.title + '」？')) { changeGroup({ chapters: group.chapters.filter(item => item.id !== article.id) }); setSelected(group.id); } }}>{t("移除文章")}</Action>
            </div>
          </>}
        </>}
      </div>
    </fieldset>}
  </main>;
}
