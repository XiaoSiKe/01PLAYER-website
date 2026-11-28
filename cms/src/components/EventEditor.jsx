'use client';
import { useDeskLanguage } from './DeskLanguage';
import { Action } from './OfficialUI';
import React, { useEffect, useRef, useState } from 'react';
import { desk, deskCreateLabels, statuses, uploadDeskImage } from './desk';
import { cleanDraft, scheduleInput, scheduleInstant } from '../ops/workflow.mjs';
import { eventCategories } from '../../../server/event-categories.mjs';

const blank = {
  name: '',
  category: 'activity',
  type: eventCategories.activity,
  status: 'open',
  registrationMode: 'direct',
  registrationDestination: 'website',
  registrationUrl: '',
  location: '',
  date: '',
  subtitle: '',
  description: '',
  coverUrl: '',
  ticketGroupQrUrl: '',
  rules: [],
  formFields: [],
  submissionsOpen: false,
};
const questionTypes = { text: '简答', textarea: '长回答', select: '单选', multiselect: '多选' };

function Options({ label, value, options, onChange }) {
  const { t } = useDeskLanguage();
  return (
    <label className="community-field">
      {t(label)}
      <select aria-label={t(label)} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([key, title]) => (
          <option key={key} value={key}>
            {t(title)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Question({ item, number, update, remove }) {
  const { t } = useDeskLanguage();
  return (
    <div className="op-question">
      <div className="op-question-options">
        <h3 className="op-question-number">{t('问题 {0}', [number])}</h3>
        <label className="community-field op-question-label">
          {t('题目')}
          <input value={item.label} maxLength={200} onChange={(e) => update({ label: e.target.value })} />
        </label>
        <Options
          label={t("题型")}
          value={item.type}
          options={questionTypes}
          onChange={(type) => update({ type })}
        />
        <label className="community-field op-question-required">
          <input
            type="checkbox"
            checked={item.required}
            onChange={(e) => update({ required: e.target.checked })}
          />{' '}{t("必填")}</label>
        <Action className="op-question-remove" type="button" onClick={remove}
          aria-label={t('移除问题 {0}', [number])}>{t('移除')}</Action>
      </div>
      {['select', 'multiselect'].includes(item.type) && (
        <label className="community-field">{t("可选答案（每行一个）")}<textarea
            value={(item.options || []).join('\n')}
            onChange={(e) => update({ options: e.target.value.split('\n') })}
          />
        </label>
      )}
    </div>
  );
}

export default function EventEditor({ item, guard, onSaved }) {
  const { t } = useDeskLanguage();
  const [v, setV] = useState(() => ({ ...blank, ...item }));
  const [baseline, setBaseline] = useState(v);
  const [preview, setPreview] = useState(false);
  const [action, setAction] = useState(''),
    [notice, setNotice] = useState(null);
  const pending = useRef(false);
  const createId = useRef(null);
  const coverInput = useRef(null);
  const ticketGroupQrInput = useRef(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(baseline);
  const externalRegistration = v.registrationDestination === 'external';
  useEffect(() => {
    guard.current = () =>
      !pending.current && (!dirty || window.confirm(t('活动有未保存的修改。放弃修改并离开？')));
    function beforeUnload(event) {
      if (dirty || pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    // Payload's shell uses client routing. Take its links through beforeunload while editing.
    function protectShellLink(event) {
      if ((!dirty && !pending.current) || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const link = event.target.closest?.('.nav a[href], .app-header a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(link.href);
    }
    document.addEventListener('click', protectShellLink, true);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      guard.current = null;
      document.removeEventListener('click', protectShellLink, true);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, guard, t]);
  function change(k, value) {
    setNotice(null);
    setV((old) => ({ ...old, [k]: value, ...(k === 'category' && { type: eventCategories[value] }) }));
  }
  async function uploadImage(event, field) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || pending.current) return;
    pending.current = true;
    const groupQr = field === 'ticketGroupQrUrl';
    setAction(groupQr ? 'upload-qr' : 'upload');
    setNotice(null);
    try {
      const label = groupQr ? '票根进群二维码' : '活动海报';
      const doc = await uploadDeskImage(file, [v.name.trim(), label].filter(Boolean).join(' · '));
      change(field, groupQr ? doc.url : doc.sizes?.wide?.url || doc.url);
      setNotice({ text: groupQr ? '二维码已上传。' : '海报已上传。' });
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally {
      pending.current = false;
      setAction('');
    }
  }
  function accept(saved) {
    const value = { ...blank, ...saved };
    setBaseline(value);
    setV(value);
  }
  async function save(mode) {
    if (pending.current) return;
    if (
      mode === 'archive' &&
      !window.confirm(
        dirty
          ? '下架后将停止报名，当前未保存的更改将被丢弃。确认下架？'
          : '下架后将停止报名。确认下架？',
      )
    )
      return;
    pending.current = true;
    setAction(mode);
    setNotice(null);
    let draftWritten = false;
    try {
      let saved = v;
      if (mode !== 'archive' && (dirty || !v.id)) {
        const draft = cleanDraft(v);
        if (!v.id) {
          createId.current ??= crypto.randomUUID();
          draft.id = createId.current;
        }
        saved = await desk('staff/events' + (v.id ? '/' + v.id : ''), draft);
        accept(saved);
        draftWritten = true;
        onSaved(saved.id);
      }
      if (mode !== 'draft') {
        saved = await desk('staff/events/' + saved.id + '/' + mode, {
          draftRevision: saved.draftRevision,
        });
        accept(saved);
        onSaved(saved.id);
      }
      setNotice({
        text: { draft: '草稿已保存。', publish: '已发布到官网。', archive: '活动已下架。' }[
          mode
        ],
      });
    } catch (error) {
      setNotice({
        error: true,
        conflict: error.status === 409,
        text: (mode === 'publish' && draftWritten ? '草稿已保存，发布未完成。' : '') + error.message,
      });
    } finally {
      pending.current = false;
      setAction('');
    }
  }
  async function refreshVersion() {
    if (pending.current || (dirty && !window.confirm('载入最新版本将替换当前未保存的修改。继续吗？')))
      return;
    pending.current = true;
    setAction('refresh');
    try {
      const latest = await desk('staff/events/' + (v.id || createId.current));
      accept(latest);
      onSaved(latest.id);
      setNotice({ text: '已载入最新版本。' });
    } catch (error) {
      setNotice({ error: true, conflict: true, text: error.message });
    } finally {
      pending.current = false;
      setAction('');
    }
  }
  const select = (key, label, options) => (
    <Options label={label} value={v[key]} options={options} onChange={(value) => change(key, value)} />
  );
  const textField = (key, label, required = false) => (
    <label className="community-field">
      {t(label)}
      <input
        value={v[key] || ''}
        required={required}
        maxLength={500}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const feedback = action
    ? {
        draft: '正在保存草稿…',
        publish: '正在发布…',
        archive: '正在下架…',
        refresh: '正在读取最新版本…',
        upload: '正在上传海报…',
        'upload-qr': '正在上传二维码…',
      }[action]
    : notice?.text ||
      (dirty
        ? '有未保存的修改'
        : v.id
          ? v.hasDraftChanges
            ? '有未发布的草稿'
            : statuses[v.publicationStatus]
          : '尚未保存');
  return (
    <div className="op-detail op-event-editor">
      <div className="op-head">
        <h2>{t(v.id ? '编辑活动' : deskCreateLabels.events)}</h2>
      </div>
      {preview ? (
        <article className="event-preview">
          {v.coverUrl && <img src={v.coverUrl} alt={t("活动海报")} />}
          <small>
            {t(eventCategories[v.category])} · {t(statuses[v.status])}
          </small>
          <h2>{v.name || t("活动标题")}</h2>
          {v.subtitle && <p>{v.subtitle}</p>}
          <p>
            {[v.date || scheduleInput(v.startsAt).replace('T', ' '), v.location]
              .filter(Boolean)
              .join('　·　')}
          </p>
          <p className="op-prose">{v.description}</p>
          {v.rules.some((r) => r.trim()) && (
            <ol>
              {v.rules
                .filter((r) => r.trim())
                .map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
            </ol>
          )}
          <h3>{externalRegistration ? t("外部报名") : t("官网报名表")}</h3>
          {externalRegistration ? <p>{v.registrationUrl || t("尚未填写外部报名链接")}</p> : <><p>{t("称呼、电话号码、微信（选填）")}{v.formFields.length
              ? ' · ' + v.formFields.map((q) => q.label || t('未命名问题')).join(' · ')
              : ''}
          </p>
          <p>{v.registrationMode === 'review' ? t("提交后由运营审核") : t("提交后直接确认报名")}</p></>}
        </article>
      ) : (
        <fieldset className="op-editor-fields" disabled={Boolean(action)} aria-label={t("活动设置")}>
          <section className="op-form-section" aria-labelledby="event-info">
            <h2 id="event-info">{t("活动信息")}</h2>
            <div className="op-form-grid op-event-info-fields">
              {textField('name', t("活动名称"), true)}
              {textField('subtitle', t("活动标语"))}
              {select('category', t("活动类型"), eventCategories)}
              <div className="op-cover-field">
                <label className="community-field">
                  {t('活动海报')}
                  <input value={v.coverUrl || ''} onChange={event => change('coverUrl', event.target.value)} />
                </label>
                <Action onClick={() => coverInput.current?.click()}>{t('上传图片')}</Action>
                {v.coverUrl && <img className="op-cover-thumb" src={v.coverUrl} alt={t("当前活动海报")} />}
                <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  hidden aria-label={t('上传活动海报')} onChange={event => uploadImage(event, 'coverUrl')} />
              </div>
              <label className="op-wide community-field">
                {t('活动介绍')}
                <textarea rows={3} maxLength={12000} value={v.description}
                  onChange={event => change('description', event.target.value)} />
              </label>
            </div>
          </section>
          <div className={externalRegistration ? 'op-event-sections op-event-sections--external' : 'op-event-sections'}>
            <section className="op-form-section" aria-labelledby="event-schedule">
              <h2 id="event-schedule">{t("时间与地点")}</h2>
              <p>{t("所有时间均为北京时间（UTC+8）。")}</p>
              <div className="op-form-grid op-event-schedule">
                {textField('location', t("地点或线上方式"))}
                {textField('date', t("对外展示日期"))}
                {Object.entries({
                  startsAt: t("开始时间"),
                  endsAt: t("结束时间"),
                  registrationClosesAt: t("报名截止时间"),
                }).map(([key, label]) => (
                  <label key={key} className="community-field">
                    {t(label)}
                    <input
                      type="datetime-local"
                      value={scheduleInput(v[key])}
                      onChange={(e) => change(key, scheduleInstant(e.target.value))}
                    />
                  </label>
                ))}
              </div>
            </section>
            <section className="op-form-section" aria-labelledby="event-registration">
              <h2 id="event-registration">{t("参与与报名")}</h2>
              <div className="op-form-grid">
                <div className="op-wide op-registration-controls">
                  {select('status', '活动状态', { open: '报名中', active: '进行中', ended: '已结束' })}
                  {select('registrationDestination', '报名入口', { website: '官网报名', external: '外部链接' })}
                  {!externalRegistration && select('registrationMode', '报名确认方式', { direct: '直接报名成功', review: '须运营审核' })}
                </div>
                {externalRegistration && <label className="op-wide community-field">{t("外部报名链接")}<input aria-label={t("外部报名链接")} type="url" maxLength={2000} value={v.registrationUrl || ''} placeholder="https://…"
                    onChange={e => change('registrationUrl', e.target.value)} />
                  <small>{t("发布后，官网活动信息中的参与按钮将打开此链接。")}</small>
                </label>}
                <label className="op-wide community-field">{t("参与规则（每行一条）")}<textarea
                    rows={5}
                    value={v.rules.join('\n')}
                    onChange={(e) => change('rules', e.target.value.split('\n'))}
                  />
                </label>
                <label className="op-wide community-field">
                  <input
                    type="checkbox"
                    checked={v.submissionsOpen}
                    onChange={(e) => change('submissionsOpen', e.target.checked)}
                  />{t("开放作品提交")}</label>
                <div className="op-wide op-ticket-group-qr" role="group" aria-label={t('票根进群二维码（选填）')}>
                  <span>{t('票根进群二维码（选填）')}</span>
                  {v.ticketGroupQrUrl && <img src={v.ticketGroupQrUrl} alt={t('票根进群二维码')} />}
                  <div className="op-ticket-group-qr-actions">
                    <Action onClick={() => ticketGroupQrInput.current?.click()}>{t('上传二维码')}</Action>
                    {v.ticketGroupQrUrl && <Action onClick={() => change('ticketGroupQrUrl', '')}>{t('移除二维码')}</Action>}
                  </div>
                  <input ref={ticketGroupQrInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    hidden aria-label={t('上传二维码')} onChange={event => uploadImage(event, 'ticketGroupQrUrl')} />
                </div>
              </div>
            </section>
            {!externalRegistration && <section className="op-form-section op-event-questions" aria-labelledby="event-questions">
              <div className="op-questions-head">
                <h2 id="event-questions">{t("报名问题")}</h2>
                <Action
                  type="button"
                  disabled={v.formFields.length >= 30}
                  onClick={() =>
                    change('formFields', [
                      ...v.formFields,
                      { id: crypto.randomUUID(), label: '', type: 'text', required: false },
                    ])
                  }
                >{t("＋ 添加问题")}</Action>
              </div>
              {v.formFields.map((q, i) => (
                <Question
                  key={q.id}
                  item={q}
                  number={i + 1}
                  update={(patch) =>
                    change(
                      'formFields',
                      v.formFields.map((f, n) => (n === i ? { ...f, ...patch } : f)),
                    )
                  }
                  remove={() =>
                    change(
                      'formFields',
                      v.formFields.filter((_, n) => n !== i),
                    )
                  }
                />
              ))}
            </section>}
          </div>
        </fieldset>
      )}
      <div className="op-save">
        <p role={notice?.error ? 'alert' : 'status'} className="op-save-state">
          {t(feedback)}
        </p>
        <div className="op-line">
          {notice?.conflict && (v.id || createId.current) && (
            <Action type="button" disabled={Boolean(action)} onClick={refreshVersion}>{t("载入最新版本")}</Action>
          )}
          <Action type="button" onClick={() => setPreview(!preview)} aria-pressed={preview}>
            {preview ? t("继续编辑") : t("预览活动")}
          </Action>
          <Action
            type="button"
            disabled={Boolean(action) || !v.name.trim() || (!dirty && Boolean(v.id))}
            onClick={() => save('draft')}
          >{t("保存草稿")}</Action>
          <Action
            type="button"
            disabled={
              Boolean(action) ||
              !v.name.trim() ||
              (v.publicationStatus === 'published' && !v.hasDraftChanges && !dirty)
            }
            onClick={() => save('publish')}
          >{t("发布活动")}</Action>
          {v.publicationStatus === 'published' && (
            <Action type="button" disabled={Boolean(action)} onClick={() => save('archive')}>{t("下架活动")}</Action>
          )}
        </div>
      </div>
    </div>
  );
}
