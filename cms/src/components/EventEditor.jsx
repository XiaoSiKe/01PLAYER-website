'use client';
import { Action } from './OfficialUI';
import React, { useEffect, useRef, useState } from 'react';
import { desk, statuses } from './desk';
import { MediaPicker } from './RowsField';
import { cleanDraft, scheduleInput, scheduleInstant } from '../ops/workflow.mjs';
import { eventCategories } from '../../../server/event-categories.mjs';

const blank = {
  name: '',
  category: 'activity',
  type: '共创活动',
  status: 'open',
  registrationMode: 'direct',
  location: '',
  date: '',
  subtitle: '',
  description: '',
  coverUrl: '',
  rules: [],
  formFields: [],
  submissionsOpen: false,
};
const questionTypes = { text: '简答', textarea: '长回答', select: '单选', multiselect: '多选' };

function Options({ label, value, options, onChange }) {
  return (
    <label className="community-field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([key, title]) => (
          <option key={key} value={key}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function Question({ item, number, update, remove }) {
  return (
    <div className="op-question">
      <div className="op-question-head">
        <h3>问题 {number}</h3>
        <Action type="button" onClick={remove} aria-label={'移除问题 ' + number}>
          移除
        </Action>
      </div>
      <label className="community-field">
        题目
        <input value={item.label} maxLength={200} onChange={(e) => update({ label: e.target.value })} />
      </label>
      <div className="op-question-options">
        <Options
          label="题型"
          value={item.type}
          options={questionTypes}
          onChange={(type) => update({ type })}
        />
        <label className="community-field">
          <input
            type="checkbox"
            checked={item.required}
            onChange={(e) => update({ required: e.target.checked })}
          />{' '}
          必填
        </label>
      </div>
      {['select', 'multiselect'].includes(item.type) && (
        <label className="community-field">
          可选答案（每行一个）
          <textarea
            value={(item.options || []).join('\n')}
            onChange={(e) => update({ options: e.target.value.split('\n') })}
          />
        </label>
      )}
    </div>
  );
}

export default function EventEditor({ item, guard, onBack, onSaved }) {
  const [v, setV] = useState(() => ({ ...blank, ...item }));
  const [baseline, setBaseline] = useState(v);
  const [picker, setPicker] = useState(false),
    [preview, setPreview] = useState(false);
  const [action, setAction] = useState(''),
    [notice, setNotice] = useState(null);
  const pending = useRef(false);
  const createId = useRef(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(baseline);
  useEffect(() => {
    guard.current = () =>
      !pending.current && (!dirty || window.confirm('活动有未保存的修改。放弃修改并离开？'));
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
  }, [dirty, guard]);
  function change(k, value) {
    setNotice(null);
    setV((old) => ({ ...old, [k]: value }));
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
        text: { draft: '草稿已保存。', publish: '已发布到官网与小程序。', archive: '活动已下架。' }[
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
      {label}
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
    <div className="op-detail">
      <Action type="button" onClick={onBack} disabled={Boolean(action)}>
        ← 全部活动
      </Action>
      <div className="op-head">
        <h2>{v.id ? '编辑活动' : '新建活动'}</h2>
        <Action type="button" onClick={() => setPreview(!preview)} aria-pressed={preview}>
          {preview ? '继续编辑' : '预览活动'}
        </Action>
      </div>
      {preview ? (
        <article className="event-preview">
          {v.coverUrl && <img src={v.coverUrl} alt="活动海报" />}
          <small>
            {v.type} · {statuses[v.status]}
          </small>
          <h2>{v.name || '活动标题'}</h2>
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
          <h3>报名表</h3>
          <p>
            称呼、联系方式
            {v.formFields.length
              ? '、' + v.formFields.map((q) => q.label || '未命名问题').join('、')
              : ''}
          </p>
          <p>{v.registrationMode === 'review' ? '提交后由运营审核' : '提交后直接确认报名'}</p>
        </article>
      ) : (
        <fieldset className="op-editor-fields" disabled={Boolean(action)} aria-label="活动设置">
          <section className="op-form-section" aria-labelledby="event-info">
            <h2 id="event-info">活动信息</h2>
            <div className="op-form-grid">
              {textField('name', '活动名称', true)}
              {textField('subtitle', '一句话介绍')}
              {select('category', '分类', eventCategories)}
              {textField('type', '活动类型名称')}
              <label className="op-wide community-field">
                活动介绍
                <textarea
                  rows={4}
                  maxLength={12000}
                  value={v.description}
                  onChange={(e) => change('description', e.target.value)}
                />
              </label>
              <div className="op-wide op-cover">
                <label className="community-field">
                  活动海报
                  <input value={v.coverUrl || ''} onChange={(e) => change('coverUrl', e.target.value)} />
                </label>
                {v.coverUrl && <img className="op-cover-thumb" src={v.coverUrl} alt="当前活动海报" />}
                <Action type="button" onClick={() => setPicker(!picker)}>
                  从素材库选择
                </Action>
                {picker && (
                  <MediaPicker
                    onClose={() => setPicker(false)}
                    onChoose={(m) => {
                      change('coverUrl', m.sizes?.wide?.url || m.url);
                      setPicker(false);
                    }}
                  />
                )}
              </div>
            </div>
          </section>
          <section className="op-form-section" aria-labelledby="event-schedule">
            <h2 id="event-schedule">时间与地点</h2>
            <p>所有时间均为北京时间（UTC+8）。</p>
            <div className="op-form-grid">
              {textField('location', '地点或线上方式')}
              {textField('date', '对外展示日期')}
              {Object.entries({
                startsAt: '开始时间',
                endsAt: '结束时间',
                registrationClosesAt: '报名截止时间',
              }).map(([key, label]) => (
                <label key={key}>
                  {label}
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
            <h2 id="event-registration">参与与报名</h2>
            <div className="op-form-grid">
              {select('status', '活动状态', { open: '报名中', active: '进行中', ended: '已结束' })}
              {select('registrationMode', '报名方式', { direct: '直接报名成功', review: '须运营审核' })}
              <label className="op-wide community-field">
                参与规则（每行一条）
                <textarea
                  value={v.rules.join('\n')}
                  onChange={(e) => change('rules', e.target.value.split('\n'))}
                />
              </label>
              <label className="op-wide community-field">
                <input
                  type="checkbox"
                  disabled={v.status !== 'active'}
                  checked={v.status === 'active' && v.submissionsOpen}
                  onChange={(e) => change('submissionsOpen', e.target.checked)}
                />
                开放本场作品提交{v.status !== 'active' && '（活动进行中可开启）'}
              </label>
            </div>
          </section>
          <section className="op-form-section" aria-labelledby="event-questions">
            <h2 id="event-questions">报名问题</h2>
            <p>称呼和联系方式会自动收集。可为本场活动另设问题。</p>
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
            <Action
              type="button"
              disabled={v.formFields.length >= 30}
              onClick={() =>
                change('formFields', [
                  ...v.formFields,
                  { id: crypto.randomUUID(), label: '', type: 'text', required: false },
                ])
              }
            >
              ＋ 添加问题
            </Action>
          </section>
        </fieldset>
      )}
      <div className="op-save">
        <p role={notice?.error ? 'alert' : 'status'} className="op-save-state">
          {feedback}
        </p>
        <div className="op-line">
          {notice?.conflict && (v.id || createId.current) && (
            <Action type="button" disabled={Boolean(action)} onClick={refreshVersion}>
              载入最新版本
            </Action>
          )}
          <Action
            type="button"
            disabled={Boolean(action) || !v.name.trim() || (!dirty && Boolean(v.id))}
            onClick={() => save('draft')}
          >
            保存草稿
          </Action>
          <button
            type="button"
            className="discovery-action"
            disabled={
              Boolean(action) ||
              !v.name.trim() ||
              (v.publicationStatus === 'published' && !v.hasDraftChanges && !dirty)
            }
            onClick={() => save('publish')}
          >
            发布活动
          </button>
          {v.publicationStatus === 'published' && (
            <Action type="button" disabled={Boolean(action)} onClick={() => save('archive')}>
              下架活动
            </Action>
          )}
        </div>
      </div>
    </div>
  );
}
