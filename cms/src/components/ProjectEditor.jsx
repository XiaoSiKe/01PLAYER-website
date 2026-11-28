'use client';
import ProjectImageFields from '../../../src/community/plaza/ProjectImageFields';
import { useDeskLanguage } from './DeskLanguage';
import { useEffect, useRef, useState } from 'react';
import { Field } from '../../../src/community/CommunityUi';
import { Action, DeskBack, DeskTitle } from './OfficialUI';
import { desk, deskCreateLabels } from './desk';

export default function ProjectEditor({ item, events, guard, onBack, onSaved }) {
  const { t } = useDeskLanguage();
  const submissionId = useRef(item.id);
  const saving = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [eventId, setEventId] = useState(item.eventId ?? '');
  const title = item.id ? '修改退回作品' : deskCreateLabels.projects;

  useEffect(() => {
    guard.current = () => !saving.current && (!dirty || window.confirm('离开后将丢失尚未提交的作品内容。'));
    const beforeUnload = event => {
      if (!dirty && !saving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      guard.current = null;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, guard]);

  async function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      submissionId.current ??= crypto.randomUUID();
      const path = item.id ? 'staff/projects/' + item.id : 'staff/projects';
      await desk(path, { ...values, showcaseImages: JSON.parse(values.showcaseImages || '[]'), id: submissionId.current });
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="op-form-section op-project-editor" onChange={() => setDirty(true)} onSubmit={submit}>
      {onBack ? (
        <DeskTitle title={title} heading="h2">
          <DeskBack disabled={busy} onClick={onBack} />
        </DeskTitle>
      ) : <h2>{t(title)}</h2>}
      {item.reviewNote && <p>{t("退回原因：") + item.reviewNote}</p>}
      <fieldset disabled={busy} className="op-editor-fields op-project-fields">
        <Field label={t("项目名称")} name="name" defaultValue={item.name} required maxLength={80} />
        <Field label={t("公开署名")} name="author" defaultValue={item.author} required maxLength={80} />
        <Field label={t("项目简介")} name="summary" defaultValue={item.summary} required maxLength={20} />
        <Field label={t("项目介绍")} name="description" defaultValue={item.description} required multiline />
        <ProjectImageFields value={item} staffPreview t={t} onDirty={() => setDirty(true)} />
        <div className="op-form-grid">
          
          <Field label={t("项目链接（选填）")} name="demoUrl" type="url" defaultValue={item.demoUrl} />
          <label className="community-field">
            <span>{t("关联玩家计划（选填）")}</span>
            <select name="eventId" value={eventId} onChange={event => setEventId(event.target.value)}>
              <option value="">{t("自主投稿")}</option>
              {events.filter(event => event.publicationStatus === 'published' || event.id === item.eventId)
                .map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <div hidden={Boolean(eventId)}>
            <Field label={t("外部活动名称（选填）")} name="externalSource" defaultValue={item.externalSource} maxLength={100} disabled={Boolean(eventId)} />
          </div>
        </div>
        {error && <p role="alert">{t(error)}</p>}
        <div className="op-line">
          <Action type="submit">{busy ? t("正在提交…") : t("提交审核")}</Action>
        </div>
      </fieldset>
    </form>
  );
}
