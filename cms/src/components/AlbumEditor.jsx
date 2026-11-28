'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { archiveCategories, archivePhotoCategory, archiveAlbumMatches } from '../../../server/archive-categories.mjs';
import { useDeskLanguage } from './DeskLanguage';
import { Action, DeskTitle } from './OfficialUI';
import { desk, uploadDeskImage } from './desk';
import { historicalArchiveAlbums, historicalArchivePhotos } from '../../../src/time-machine/photos';

const filters = ['all', ...Object.keys(archiveCategories)];
const emptyPhoto = { title: '', credit: '', category: 'activity', imageUrl: '' };
const pageSize = 24;
const historicalIds = new Set(historicalArchivePhotos.map(photo => photo.id));

export default function AlbumEditor({ title, events, eventsLoading, eventsError, onRefresh }) {
  const { t } = useDeskLanguage();
  const [category, setCategory] = useState('all');
  const [event, setEvent] = useState('');
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const albums = useMemo(() => [...events.filter(item => item.hasAlbum), ...historicalArchiveAlbums], [events]);
  const albumById = useMemo(() => new Map(albums.map(item => [item.id, item])), [albums]);
  const photos = useMemo(() => {
    const savedPhotos = new Map(rows.map(photo => [photo.id, photo]));
    return [
      ...historicalArchivePhotos.map(photo => ({ ...photo, ...savedPhotos.get(photo.id) })),
      ...rows.filter(photo => !historicalIds.has(photo.id)),
    ];
  }, [rows]);
  const filteredAlbums = category === 'all' ? albums : albums.filter(item => archiveAlbumMatches(item, category,
    item.photos || rows.filter(photo => photo.eventId === item.id)));
  const writableAlbums = (category === 'team-building' ? albums : filteredAlbums).filter(item => item.publicationStatus === 'published');
  const shown = photos.filter(photo => {
    const album = albumById.get(photo.eventId);
    return album && (!event || photo.eventId === event) && (category === 'all' || archivePhotoCategory(album,photo) === category);
  });
  const totalPages = Math.ceil(shown.length / pageSize);
  const currentPage = Math.min(page, totalPages || 1);
  const pictures = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const editingAlbum = albumById.get(editing?.eventId);
  const readOnly = editing?.id && !editingAlbum?.historical && editingAlbum?.publicationStatus !== 'published';

  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError('');
    desk('staff/photos', undefined, event ? { event } : undefined, request.signal)
      .then(items => { if (!request.signal.aborted) setRows(items); })
      .catch(error => { if (!request.signal.aborted) setError(error.message); })
      .finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [event, revision]);

  function refresh() {
    onRefresh();
    setRevision(value => value + 1);
  }
  function change(key, value) {
    setEditing(current => ({ ...current, [key]: value }));
  }
  function close() {
    setEditing(null);
    setError('');
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    try {
      const media = await uploadDeskImage(file, editing.title.trim() || file.name);
      setEditing(current => ({ ...current, imageUrl: media.url, fullImage: media.url }));
    } catch (error) {
      setError(error.message);
    } finally {
      setUploading(false);
    }
  }
  async function save(remove = false) {
    if (busy || uploading || readOnly || !editing.eventId) return;
    if (remove && !window.confirm(t('移除后该照片将从零一时光机撤下。确认移除？'))) return;
    setBusy(true);
    setError('');
    try {
      const path = 'staff/photos' + (editing.id ? '/' + editing.id : '') + (remove ? '/remove' : '');
      const saved = await desk(path, editing);
      setRows(current => remove
        ? current.filter(photo => photo.id !== editing.id)
        : current.some(photo => photo.id === saved.id)
          ? current.map(photo => photo.id === saved.id ? saved : photo)
          : [...current, saved]);
      if (!remove && !editing.id) {
        setEvent(editing.eventId);
        setPage(1);
      }
      close();
      setRevision(value => value + 1);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const loadingAlbum = eventsLoading || loading;

  return (
    <>
      <DeskTitle title={title}>
        <div className="op-line op-album-actions">
          <Action disabled={busy || Boolean(editing)} onClick={refresh}>{t('刷新')}</Action>
          <Action disabled={busy || Boolean(editing) || eventsLoading || Boolean(eventsError) || !writableAlbums.length}
            onClick={() => {
              setError('');
              const eventId = writableAlbums.find(item => item.id === event)?.id
                ?? (writableAlbums.length === 1 ? writableAlbums[0].id : '');
              setEditing({ ...emptyPhoto, eventId, ...(category === 'team-building' && {category:'team-building'}) });
            }}>
            <FiPlus aria-hidden="true" /> {t('添加照片')}
          </Action>
        </div>
      </DeskTitle>
      {editing ? (
        <fieldset disabled={busy || uploading} className="op-photo-form op-editor-fields op-form-section">
          <h2>{t(editing.id ? '编辑照片' : '添加照片')}</h2>
          {error && <p role="alert">{t(error)}</p>}
          {readOnly && <p>{t('活动已下架，照片仅供查看。')}</p>}
          <div className="op-photo-form-body">
            <div className="op-photo-fields">
              <label className="community-field">
                {t('所属活动')}
                <select aria-label={t('所属活动')} value={editing.eventId} disabled={Boolean(editing.id)}
                  onChange={event => change('eventId', event.target.value)}>
                  <option value="" disabled>{t('选择活动')}</option>
                  {(editingAlbum && editing.id ? [editingAlbum] : writableAlbums).map(item =>
                    <option key={item.id} value={item.id}>{t(item.name)}</option>)}
                </select>
              </label>
              <label className="community-field">
                {t('照片说明')}
                <input value={editing.title} readOnly={Boolean(readOnly)} onChange={event => change('title', event.target.value)} maxLength={250} />
              </label>
              <label className="community-field">
                {t('摄影署名')}
                <input value={editing.credit || ''} readOnly={Boolean(readOnly)} onChange={event => change('credit', event.target.value)} maxLength={100} />
              </label>
            </div>
            {editing.imageUrl && <a className="op-photo-preview" href={editing.fullImage || editing.imageUrl}
              target="_blank" rel="noreferrer" aria-label={t('查看原图')}>
              <img src={editing.imageUrl} alt={t('所选图片')} />
            </a>}
          </div>
          <div className={readOnly ? 'op-line' : 'op-photo-actions'}>
            {!readOnly && <>
              <Action onClick={() => fileInput.current?.click()}>{t(uploading ? '正在上传图片…' : '上传图片')}</Action>
              <input ref={fileInput} type="file" hidden aria-label={t('上传图片')}
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={upload} />
              <Action disabled={!editing.eventId || !editing.imageUrl || !editing.title.trim()} onClick={() => save()}>
                {t('保存照片')}
              </Action>
            </>}
            <Action onClick={close}>{t('取消')}</Action>
          </div>
          {editing.id && !readOnly && !editingAlbum?.historical &&
            <div className="op-line"><Action onClick={() => save(true)}>{t('移出相册')}</Action></div>}
        </fieldset>
      ) : (
        <section className="op-album" aria-label={t('活动相册')}>
          <div className="op-tabs op-category-tabs" role="group" aria-label={t('相册分类')}>
            {filters.map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => {
              setCategory(key);
              setEvent('');
              setPage(1);
            }}>{t(key === 'all' ? '全部' : archiveCategories[key])}</button>)}
          </div>
          <div className="op-filters op-album-filters">
            <label className="community-field">
              {t('选择活动')}
              <select aria-label={t('选择活动')} value={event} onChange={changeEvent => {
                setEvent(changeEvent.target.value);
                setPage(1);
              }}>
                <option value="">{t('所有活动')}</option>
                {filteredAlbums.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {!loadingAlbum && !error && !eventsError && <span role="status">{t('{0} 张照片', [shown.length])}</span>}
          </div>
          {(eventsError || error) && <p role="alert">{t(eventsError || error)}</p>}
          {pictures.length ? <ul className="op-album-grid">
              {pictures.map(photo => {
                const album = albumById.get(photo.eventId);
                return <li key={photo.id}>
                  <button type="button" className={album.historical ? 'op-album-archive-photo' : undefined}
                    disabled={loadingAlbum || Boolean(error || eventsError)}
                    onClick={() => { setError(''); setEditing(photo); }}>
                    <img src={photo.imageUrl || photo.image} alt="" loading="lazy" />
                    <strong>{photo.title}</strong>
                    <small>{t(album.name)}</small>
                  </button>
                </li>;
              })}
            </ul> : loadingAlbum ? <p role="status">{t('正在读取本场照片…')}</p>
              : !eventsError && !error && <p className="op-empty">{t(albums.length ? '当前分类暂无照片。' : '活动开始后可以维护本场相册。')}</p>}
          {totalPages > 1 && <nav className="cu-pagination" aria-label={t('相册分页')}>
            <Action disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('上一页')}</Action>
            <span>{t('第 {0} 页 / 共 {1} 页', [currentPage, totalPages])}</span>
            <Action disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>{t('下一页')}</Action>
          </nav>}
        </section>
      )}
    </>
  );
}
