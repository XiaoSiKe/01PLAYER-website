import { useState } from 'react';
import SpecularButton from '../SpecularButton';
import { communityApi } from '../community/api';

export default function EventAlbumPhotoForm({ album, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function addPhoto(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setMessage('');
    try {
      await communityApi('photos', { ...Object.fromEntries(new FormData(form)), eventId: album.eventId });
      form.reset();
      setMessage('照片已加入本场专题。');
      await onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="tm-photo-form" onSubmit={addPhoto}>
    <p>{album.name}</p>
    <label>照片说明<input name="title" required maxLength={250} /></label>
    <label>照片链接<input name="imageUrl" required placeholder="https://… 或已有 /images/… 路径" maxLength={2000} /></label>
    <label>分类<select name="category">
      <option value="activity">活动照片</option>
      <option value="competition">比赛现场</option>
      <option value="team-building">零一团建</option>
    </select></label>
    <label>摄影署名（选填）<input name="credit" maxLength={100} /></label>
    <p>请使用已获授权、可公开展示的图片。照片会公开到本活动专题。</p>
    <SpecularButton size="md" type="submit" disabled={busy}>{busy ? '正在保存…' : '添加照片'}</SpecularButton>
    {message && <p role="status">{message}</p>}
  </form>;
}
