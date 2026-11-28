'use client';

import { useEffect, useRef, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { Action, DeskBack, DeskTitle } from './OfficialUI';
import { useDeskLanguage } from './DeskLanguage';
import { readDeskJson, uploadDeskImage } from './desk';

const kinds = { certificate: '获奖证书', photo: '比赛现场' };
const endpoint = '/cms-api/research';

export default function ResearchEditor() {
  const { t } = useDeskLanguage();
  const [catalog, setCatalog] = useState(null);
  const [kind, setKind] = useState('all');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const file = useRef(null);
  const pending = useRef(false);
  const busyLabel = busy === 'upload' ? '正在上传图片…' : '处理中…';

  async function load(signal) {
    setBusy('load');
    setError('');
    try {
      const result = await readDeskJson(endpoint, {}, signal);
      if (!signal?.aborted) setCatalog(result);
    } catch (error) {
      if (!signal?.aborted) setError(error.message);
    } finally {
      if (!signal?.aborted) setBusy('');
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  function change(changes) {
    setEditing(item => ({ ...item, ...changes }));
  }

  async function upload(event) {
    const image = event.target.files?.[0];
    event.target.value = '';
    if (!image || pending.current) return;
    pending.current = true;
    setBusy('upload');
    setError('');
    try {
      const media = await uploadDeskImage(image, editing.title.trim() || image.name);
      const ratio = media.width && media.height ? media.width / media.height : 1.5;
      change({
        image: media.url, fullImage: media.url, aspectRatio: ratio, fullAspectRatio: ratio,
        orientation: ratio > 1 ? 'landscape' : 'portrait',
      });
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setBusy('');
    }
  }

  async function save(status) {
    if (!catalog || pending.current) return;
    pending.current = true;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const existing = editing && catalog.rows.some(row => row.id === editing.id);
      const rows = !editing ? catalog.rows : existing
        ? catalog.rows.map(row => row.id === editing.id ? editing : row)
        : [...catalog.rows, editing];
      const result = await readDeskJson(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-01-desk': '1' },
        body: JSON.stringify({ rows, revision: catalog.revision, status }),
      });
      setCatalog(result);
      setEditing(null);
      setNotice(status === 'published' ? '科研与竞赛素材已发布。' : '草稿已保存。');
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setBusy('');
    }
  }

  const rows = catalog?.rows.filter(row => kind === 'all' || row.kind === kind) ?? [];
  return <main className="community-page op-shell">
    <DeskTitle title="零一科研与竞赛">
      {!editing && <div className="op-line">
          <Action disabled={Boolean(busy)} onClick={() => load()}>{t('刷新')}</Action>
          {catalog?.status === 'draft' && <Action disabled={Boolean(busy)} onClick={() => save('published')}>{t('发布到官网')}</Action>}
          <Action disabled={Boolean(busy) || !catalog} onClick={() => {
            setError('');
            setNotice('');
            setEditing({ id: crypto.randomUUID(), title: '', kind: kind === 'all' ? 'certificate' : kind, image: '' });
          }}><FiPlus aria-hidden="true" /> {t('添加素材')}</Action>
        </div>}
    </DeskTitle>
    {error && <p role="alert">{t(error)}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {editing ? (
      <fieldset className="op-editor-fields op-form-section op-research-edit" disabled={Boolean(busy)}>
        <div className="op-research-edit-head">
          <h2>{t(catalog.rows.some(row => row.id === editing.id) ? '编辑素材' : '添加素材')}</h2>
          <DeskBack disabled={Boolean(busy)} onClick={() => { setEditing(null); setError(''); }} />
        </div>
        <label className="community-field">{t('素材名称')}
          <input value={editing.title} onChange={event => change({ title: event.target.value })} maxLength={250} />
        </label>
        <label className="community-field">{t('素材分类')}
          <select aria-label={t('素材分类')} value={editing.kind} onChange={event => change({ kind: event.target.value })}>
            {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
        </label>
        {editing.image && <img className="op-thumb" src={editing.image} alt={t('所选图片')} />}
        <div className="op-line">
          <Action onClick={() => file.current?.click()}>{t('上传图片')}</Action>
          <input ref={file} type="file" hidden aria-label={t('上传图片')}
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={upload} />
          <Action disabled={!editing.title.trim() || !editing.image} onClick={() => save('draft')}>{t('保存草稿')}</Action>
          <Action disabled={!editing.title.trim() || !editing.image} onClick={() => save('published')}>{t('发布到官网')}</Action>
        </div>
      </fieldset>
    ) : catalog && <>
      <div className="op-tabs op-category-tabs" role="group" aria-label={t('素材分类')}>
        {Object.entries({ all: '全部', ...kinds }).map(([key, label]) =>
          <button type="button" key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>{t(label)}</button>
        )}
      </div>
      {rows.length ? <ul className="op-album-grid op-research-grid">
        {rows.map(item => <li key={item.id}>
          <button type="button" onClick={() => { setError(''); setEditing(item); }}>
            <img src={item.image} alt="" loading="lazy" />
            <strong>{item.title}</strong>
            <small>{t(kinds[item.kind] || item.kind)}</small>
          </button>
        </li>)}
      </ul> : <p className="op-empty">{t('当前分类暂无素材。')}</p>}
    </>}
    {busy && <p role="status">{t(busyLabel)}</p>}
  </main>;
}
