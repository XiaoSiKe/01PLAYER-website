'use client';
import { Action } from './OfficialUI';
import React, { useEffect, useMemo, useState } from 'react';
import { desk } from './desk';
import { MediaPicker } from './RowsField';

const emptyPhoto = { title: '', credit: '', category: 'activity', imageUrl: '' };
export default function AlbumEditor({ events }) {
  const eligible = useMemo(() => events.filter((e) => e.hasAlbum), [events]);
  const options = useMemo(() => eligible.map(({ id, name }) => (
    <option key={id} value={id}>{name}</option>
  )), [eligible]);
  const [event, setEvent] = useState('');
  const current = eligible.find((e) => e.id === event) || eligible[0];
  const [saving, setSaving] = useState(false);
  if (!current) return <p>活动开始后可以维护本场相册。</p>;
  return (
    <section>
      <label className="community-field">
        活动相册
        <select
          aria-label="活动相册"
          value={current.id}
          disabled={saving}
          onChange={(e) => setEvent(e.target.value)}
        >
          {options}
        </select>
      </label>
      <Album key={current.id} current={current.id} onSaving={setSaving} />
    </section>
  );
}
function Album({ current, onSaving }) {
  const [rows, setRows] = useState([]),
    [editing, setEditing] = useState(null),
    [choosing, setChoosing] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError('');
    desk('staff/photos', undefined, { event: current }, request.signal)
      .then((list) => {
        if (!request.signal.aborted) setRows(list);
      })
      .catch((e) => {
        if (!request.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [current, revision]);
  const set = (key, value) => setEditing((old) => ({ ...old, [key]: value }));
  async function save(remove = false) {
    if (remove && !window.confirm('移除后该照片将从活动相册撤下。确认移除？')) return;
    setBusy(true);
    onSaving(true);
    setError('');
    try {
      const path = 'staff/photos' + (editing.id ? '/' + editing.id : '') + (remove ? '/remove' : '');
      await desk(path, { ...editing, eventId: current });
      setEditing(null);
      setChoosing(false);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      onSaving(false);
    }
  }
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {editing ? (
        <fieldset disabled={busy} className="op-photo-form op-editor-fields">
          <h2>{editing.id ? '编辑照片' : '添加照片'}</h2>
          <label className="community-field">
            照片说明
            <input value={editing.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="community-field">
            摄影署名
            <input value={editing.credit || ''} onChange={(e) => set('credit', e.target.value)} />
          </label>
          <label className="community-field">
            分类
            <select value={editing.category} onChange={(e) => set('category', e.target.value)}>
              <option value="activity">活动照片</option>
              <option value="competition">比赛现场</option>
              <option value="certificate">获奖证书</option>
            </select>
          </label>
          {editing.imageUrl && <img className="op-thumb" src={editing.imageUrl} alt="所选图片" />}
          <Action onClick={() => setChoosing(!choosing)}>从素材库选择图片</Action>
          {choosing && (
            <MediaPicker
              onChoose={(m) => {
                set('imageUrl', m.url);
                setChoosing(false);
              }}
              onClose={() => setChoosing(false)}
            />
          )}
          <div className="op-line">
            <button
              className="discovery-action"
              disabled={busy || !editing.imageUrl || !editing.title.trim()}
              onClick={() => save()}
            >
              保存照片
            </button>
            <Action
              onClick={() => {
                setEditing(null);
                setChoosing(false);
                setError('');
              }}
            >
              取消
            </Action>
            {editing.id && (
              <Action disabled={busy} onClick={() => save(true)}>
                移出相册
              </Action>
            )}
          </div>
        </fieldset>
      ) : loading ? (
        <p role="status">正在读取本场照片…</p>
      ) : error ? (
        <Action onClick={() => setRevision((r) => r + 1)}>重新读取相册</Action>
      ) : (
        <>
          <div className="op-head">
            <span>{rows.length} 张照片</span>
            <Action onClick={() => setEditing(emptyPhoto)}>＋ 添加照片</Action>
          </div>
          <div className="asset-grid">
            {rows.map((photo) => (
              <button key={photo.id} onClick={() => setEditing(photo)}>
                <img src={photo.imageUrl || photo.image} alt="" />
                {photo.title}
              </button>
            ))}
          </div>
          {!rows.length && <p className="op-empty">本场相册还没有照片。</p>}
        </>
      )}
    </div>
  );
}
